import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, getDecryptedTokens } from '@/lib/booksy/gmail-auth'
import { getBooksyGmailRedirectUri } from '@/lib/google/get-google-redirect-uri'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Tables } from '@/types/supabase'

type AdminSupabaseClient = SupabaseClient<Database>
type GmailAccountRow = Tables<'booksy_gmail_accounts'>
type ReconciliationRunRow = Tables<'booksy_reconciliation_runs'>
type ReconcileRequestConfig = {
  accountId?: string
  includeForwarded: boolean
  windowDays: number
  syncFromDate?: string | null
}

type GmailMetadata = {
  gmailMessageId: string
  gmailThreadId: string | null
  gmailHistoryId: number | null
  internalDate: string | null
  subject: string | null
  fromAddress: string | null
  messageIdHeader: string | null
  rawMimeBase64Url?: string | null
  storagePath?: string | null
  rawSha256?: string | null
}

type ForwardedBooksySignalAnalysis = {
  containsBooksyWord: boolean
  containsBooksyAddress: boolean
  hasForwardMarker: boolean
  hasForwardedFromHeader: boolean
  hasForwardedSubjectHeader: boolean
  hasBookingIntent: boolean
  hasBooksyBranding: boolean
  accepted: boolean
}

const RECONCILIATION_WINDOW_DAYS = 14
const RAW_EMAIL_BUCKET = 'booksy-raw-emails'

async function parseRequestConfig(request: NextRequest): Promise<ReconcileRequestConfig> {
  const body = await request.json().catch(() => ({}))
  const requestedWindowDays = typeof body?.windowDays === 'number'
    ? body.windowDays
    : Number(body?.windowDays)

  return {
    accountId: typeof body?.accountId === 'string' && body.accountId.length > 0
      ? body.accountId
      : undefined,
    includeForwarded:
      body?.includeForwarded === true ||
      body?.includeForwarded === 'true' ||
      body?.includeForwarded === 1 ||
      body?.includeForwarded === '1',
    windowDays: Number.isFinite(requestedWindowDays) && requestedWindowDays > 0
      ? Math.min(requestedWindowDays, 30)
      : RECONCILIATION_WINDOW_DAYS,
    syncFromDate: typeof body?.syncFromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.syncFromDate)
      ? body.syncFromDate
      : null,
  }
}

function resolveEffectiveWindowStart(windowStart: Date, syncFromDate?: string | null): Date {
  if (!syncFromDate) {
    return windowStart
  }

  const baseline = new Date(`${syncFromDate}T00:00:00.000Z`)
  if (Number.isNaN(baseline.getTime())) {
    return windowStart
  }

  return baseline > windowStart ? baseline : windowStart
}

function validateInternalCronHeader(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const provided = request.headers.get('x-cron-secret') ?? ''

  if (
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function parseHistoryId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseInternalDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return new Date(parsed).toISOString()
}

function getHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | null {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
  const value = match?.value?.trim()
  return value && value.length > 0 ? value : null
}

function splitMime(rawMime: string): { headers: Record<string, string>; body: string } {
  const normalized = rawMime.replace(/\r\n/g, '\n')
  const separator = normalized.indexOf('\n\n')

  if (separator === -1) {
    return { headers: {}, body: normalized }
  }

  const headerText = normalized.slice(0, separator)
  const body = normalized.slice(separator + 2)
  const headers: Record<string, string> = {}
  let currentHeader: string | null = null

  for (const line of headerText.split('\n')) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    currentHeader = line.slice(0, colonIndex).trim().toLowerCase()
    headers[currentHeader] = line.slice(colonIndex + 1).trim()
  }

  return { headers, body }
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function extractForwardedBooksyHeaders(rawMimeDecoded: string): {
  forwardedFrom: string | null
  forwardedSubject: string | null
} {
  const normalized = rawMimeDecoded.replace(/\r\n/g, '\n')
  const forwardedFromMatch =
    normalized.match(/^[>\s-]*from:\s*(.+<[^>]+@booksy\.com>)$/im) ??
    normalized.match(/^[>\s-]*od:\s*(.+<[^>]+@booksy\.com>)$/im)
  const forwardedSubjectMatch =
    normalized.match(/^[>\s-]*subject:\s*(.+)$/im) ??
    normalized.match(/^[>\s-]*temat:\s*(.+)$/im)

  return {
    forwardedFrom: forwardedFromMatch?.[1]?.trim() ?? null,
    forwardedSubject: forwardedSubjectMatch?.[1]?.trim() ?? null,
  }
}

function analyzeForwardedBooksyEmail(
  rawMimeDecoded: string,
  forwarded: ReturnType<typeof extractForwardedBooksyHeaders>,
  topLevelFrom: string | null,
  topLevelSubject: string | null
): ForwardedBooksySignalAnalysis {
  const normalized = normalizeForMatch(rawMimeDecoded)
  const normalizedTopLevelFrom = normalizeForMatch(topLevelFrom ?? '')
  const normalizedTopLevelSubject = normalizeForMatch(topLevelSubject ?? '')
  const normalizedForwardedFrom = normalizeForMatch(forwarded.forwardedFrom ?? '')
  const normalizedForwardedSubject = normalizeForMatch(forwarded.forwardedSubject ?? '')

  const containsBooksyWord =
    normalized.includes('booksy') ||
    normalizedTopLevelFrom.includes('booksy') ||
    normalizedForwardedFrom.includes('booksy') ||
    normalizedTopLevelSubject.includes('booksy') ||
    normalizedForwardedSubject.includes('booksy')
  const containsBooksyAddress =
    normalized.includes('@booksy.com') ||
    normalizedTopLevelFrom.includes('@booksy.com') ||
    normalizedForwardedFrom.includes('@booksy.com')

  const hasForwardMarker =
    normalized.includes('forwarded message') ||
    normalized.includes('wiadomosc przekazana dalej') ||
    normalized.includes('wiadomosc przekazana dalej') ||
    normalized.includes('fwd:') ||
    normalized.includes('fw:')
  const hasForwardedFromHeader = Boolean(forwarded.forwardedFrom)
  const hasForwardedSubjectHeader = Boolean(forwarded.forwardedSubject)
  const hasBookingIntent =
    normalized.includes('twoj klient oczekuje na potwierdzenie rezerwacji') ||
    normalized.includes('rezerwacja z booksy') ||
    normalized.includes('odwolal wizyte') ||
    normalized.includes('zmienil rezerwacje') ||
    normalized.includes('zmienil rezerwacje i czeka na potwierdzenie') ||
    normalized.includes('nowa rezerwacja') ||
    normalized.includes('odwoal wizyte') ||
    normalized.includes('odwolal swoja usluge') ||
    normalized.includes('klient czeka na potwierdzenie nowego terminu')
  const hasBooksyBranding =
    normalized.includes('zarzadzaj swoimi rezerwacjami') ||
    normalized.includes('biz.booksy.com') ||
    normalized.includes('booksy-semilac') ||
    normalized.includes('twoj klient') ||
    normalized.includes('pracownik:')

  const accepted =
    containsBooksyWord && (
      (hasForwardedFromHeader && hasForwardedSubjectHeader) ||
      (hasForwardMarker && (containsBooksyAddress || hasBookingIntent || hasBooksyBranding)) ||
      (hasForwardedFromHeader && (containsBooksyAddress || hasBookingIntent || hasBooksyBranding)) ||
      (hasForwardedSubjectHeader && (hasBookingIntent || hasBooksyBranding))
    )

  return {
    containsBooksyWord,
    containsBooksyAddress,
    hasForwardMarker,
    hasForwardedFromHeader,
    hasForwardedSubjectHeader,
    hasBookingIntent,
    hasBooksyBranding,
    accepted,
  }
}

async function createOAuthClient(
  accountId: string,
  supabase: AdminSupabaseClient
): Promise<OAuth2Client> {
  const clientId = requireEnv('GOOGLE_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET')
  const { accessToken, refreshToken } = await getDecryptedTokens(accountId, supabase)

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    getBooksyGmailRedirectUri()
  )

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  oauth2Client.on('tokens', async (tokens) => {
    const encryptedAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null

    if (!encryptedAccessToken && !encryptedRefreshToken && !tokens.expiry_date) {
      return
    }

    const update: Database['public']['Tables']['booksy_gmail_accounts']['Update'] = {
      updated_at: new Date().toISOString(),
    }

    if (encryptedAccessToken) {
      update.encrypted_access_token = encryptedAccessToken
    }

    if (encryptedRefreshToken) {
      update.encrypted_refresh_token = encryptedRefreshToken
    }

    if (typeof tokens.expiry_date === 'number') {
      update.token_expires_at = new Date(tokens.expiry_date).toISOString()
    }

    const { error } = await supabase
      .from('booksy_gmail_accounts')
      .update(update)
      .eq('id', accountId)

    if (error) {
      throw new Error(`Failed to persist refreshed Booksy Gmail tokens: ${error.message}`)
    }
  })

  return oauth2Client
}

async function loadActiveMailboxes(
  supabase: AdminSupabaseClient,
  config?: ReconcileRequestConfig
): Promise<GmailAccountRow[]> {
  let query = supabase
    .from('booksy_gmail_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('auth_status', 'active')
    .order('created_at', { ascending: true })

  if (config?.accountId) {
    query = query.eq('id', config.accountId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load active Booksy Gmail mailboxes: ${error.message}`)
  }

  return data ?? []
}

async function createRun(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow,
  windowStart: string,
  windowEnd: string
): Promise<ReconciliationRunRow> {
  const { data, error } = await supabase
    .from('booksy_reconciliation_runs')
    .insert({
      salon_id: mailbox.salon_id,
      booksy_gmail_account_id: mailbox.id,
      window_start: windowStart,
      window_end: windowEnd,
      status: 'running',
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create reconciliation run: ${error.message}`)
  }

  return data
}

async function updateRun(
  supabase: AdminSupabaseClient,
  runId: string,
  update: Database['public']['Tables']['booksy_reconciliation_runs']['Update']
): Promise<void> {
  const { error } = await supabase
    .from('booksy_reconciliation_runs')
    .update(update)
    .eq('id', runId)

  if (error) {
    throw new Error(`Failed to update reconciliation run ${runId}: ${error.message}`)
  }
}

async function listMailboxMessageIds(
  oauth2Client: OAuth2Client,
  windowStart: Date,
  includeForwarded: boolean
): Promise<string[]> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const messageIds = new Set<string>()
  const afterSeconds = Math.floor(windowStart.getTime() / 1000)
  const queries = [
    `after:${afterSeconds} from:noreply@booksy.com`,
    `after:${afterSeconds} from:no-reply@booksy.com`,
  ]

  if (includeForwarded) {
    queries.push(
      `after:${afterSeconds} "@booksy.com"`,
      `after:${afterSeconds} "Forwarded message"`,
      `after:${afterSeconds} "Wiadomość przekazana dalej"`,
      `after:${afterSeconds} "Rezerwacja z booksy"`
    )
  }

  for (const query of queries) {
    let nextPageToken: string | undefined

    do {
      logger.info('Booksy reconciliation: executing Gmail search query', {
        action: 'booksy_reconcile_gmail_query',
        includeForwarded,
        query,
      })

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        pageToken: nextPageToken,
      })

      for (const message of response.data.messages ?? []) {
        if (message.id) {
          messageIds.add(message.id)
        }
      }

      nextPageToken = response.data.nextPageToken ?? undefined
    } while (nextPageToken)
  }

  return Array.from(messageIds)
}

async function loadExistingMessageIds(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('booksy_raw_emails')
    .select('gmail_message_id')
    .eq('booksy_gmail_account_id', mailbox.id)

  if (error) {
    throw new Error(`Failed to load reconciled raw emails: ${error.message}`)
  }

  return new Set((data ?? []).map((row) => row.gmail_message_id))
}

async function loadSalonSyncFromDate(
  supabase: AdminSupabaseClient,
  salonId: string
): Promise<string | null> {
  const { data, error } = await (supabase
    .from('salon_settings') as any)
    .select('*')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load Booksy sync baseline: ${error.message}`)
  }

  return data?.booksy_sync_from_date ?? null
}

async function fetchGmailMetadata(
  oauth2Client: OAuth2Client,
  mailbox: GmailAccountRow,
  gmailMessageId: string,
  ingestSource: GmailAccountRow['id'] extends string ? 'reconciliation' | 'manual_backfill' : never
): Promise<GmailMetadata> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'raw',
  })

  const rawMimeBase64Url = response.data.raw
  if (!rawMimeBase64Url) {
    throw new Error(`Gmail message ${gmailMessageId} does not contain raw MIME`)
  }

  const rawMimeDecoded = Buffer.from(rawMimeBase64Url, 'base64url').toString('utf8')
  const { headers } = splitMime(rawMimeDecoded)
  const forwarded = extractForwardedBooksyHeaders(rawMimeDecoded)
  const topLevelFrom = headers['from']?.trim() ?? null
  const topLevelSubject = headers['subject']?.trim() ?? null
  const effectiveFrom =
    topLevelFrom && normalizeForMatch(topLevelFrom).includes('@booksy.com')
      ? topLevelFrom
      : forwarded.forwardedFrom ?? topLevelFrom
  const effectiveSubject = topLevelSubject ?? forwarded.forwardedSubject ?? null
  const internalDate = parseInternalDate(response.data.internalDate)
  const internalDateSource = internalDate ? new Date(internalDate) : new Date()
  const year = internalDateSource.getUTCFullYear()
  const month = String(internalDateSource.getUTCMonth() + 1).padStart(2, '0')
  const storagePath = `${mailbox.salon_id}/${mailbox.id}/${year}/${month}/${gmailMessageId}.eml`
  const rawSha256 = createHash('sha256').update(rawMimeBase64Url).digest('hex')
  const forwardedAnalysis = analyzeForwardedBooksyEmail(
    rawMimeDecoded,
    forwarded,
    topLevelFrom,
    topLevelSubject
  )

  if (ingestSource === 'manual_backfill' && !forwardedAnalysis.accepted) {
    logger.info('Booksy reconciliation: forwarded Booksy heuristics rejected Gmail message', {
      action: 'booksy_reconcile_forwarded_analysis',
      salonId: mailbox.salon_id,
      accountId: mailbox.id,
      gmailMessageId,
      accepted: forwardedAnalysis.accepted,
      topLevelFrom,
      topLevelSubjectPreview: topLevelSubject?.slice(0, 160) ?? null,
      forwardedFrom: forwarded.forwardedFrom,
      forwardedSubjectPreview: forwarded.forwardedSubject?.slice(0, 160) ?? null,
      analysis: forwardedAnalysis,
      rawPreview: rawMimeDecoded.slice(0, 400),
    })
    throw new Error(`Gmail message ${gmailMessageId} does not look like a forwarded Booksy email`)
  }

  logger.info('Booksy reconciliation: Gmail message metadata resolved', {
    action: 'booksy_reconcile_message_metadata',
    salonId: mailbox.salon_id,
    accountId: mailbox.id,
    gmailMessageId,
    ingestSource,
    subjectPreview: effectiveSubject?.slice(0, 120) ?? null,
    fromAddress: effectiveFrom,
    hasForwardedBooksyFrom: !!forwarded.forwardedFrom,
    forwardedAnalysis: ingestSource === 'manual_backfill' ? forwardedAnalysis : undefined,
    storagePath,
  })

  return {
    gmailMessageId,
    gmailThreadId: response.data.threadId ?? null,
    gmailHistoryId: parseHistoryId(response.data.historyId),
    internalDate,
    subject: effectiveSubject,
    fromAddress: effectiveFrom,
    messageIdHeader: headers['message-id']?.trim() ?? null,
    rawMimeBase64Url,
    storagePath,
    rawSha256,
  }
}

async function persistRawMime(
  supabase: AdminSupabaseClient,
  metadata: GmailMetadata
): Promise<void> {
  if (!metadata.storagePath || !metadata.rawMimeBase64Url) {
    throw new Error('Missing raw MIME storage payload')
  }

  const buffer = Buffer.from(metadata.rawMimeBase64Url, 'base64url')
  const { error } = await supabase.storage
    .from(RAW_EMAIL_BUCKET)
    .upload(metadata.storagePath, buffer, {
      upsert: true,
      contentType: 'message/rfc822',
    })

  if (error) {
    throw new Error(`Failed to store reconciled raw Booksy email MIME: ${error.message}`)
  }
}

async function backfillMissingEmails(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow,
  oauth2Client: OAuth2Client,
  missingIds: string[],
  includeForwarded: boolean
): Promise<number> {
  let inserted = 0

  for (const gmailMessageId of missingIds) {
    let metadata: GmailMetadata

    try {
      metadata = await fetchGmailMetadata(
        oauth2Client,
        mailbox,
        gmailMessageId,
        includeForwarded ? 'manual_backfill' : 'reconciliation'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown metadata fetch error'
      if (includeForwarded && /does not look like a forwarded Booksy email/i.test(message)) {
        logger.info('Booksy reconciliation: skipping Gmail message that does not match forwarded Booksy heuristics', {
          action: 'booksy_reconcile_skip_non_booksy_forward',
          salonId: mailbox.salon_id,
          accountId: mailbox.id,
          gmailMessageId,
        })
        continue
      }
      throw error
    }

    await persistRawMime(supabase, metadata)
    logger.info('Booksy reconciliation: raw MIME stored for Gmail message', {
      action: 'booksy_reconcile_raw_stored',
      salonId: mailbox.salon_id,
      accountId: mailbox.id,
      gmailMessageId,
      storagePath: metadata.storagePath,
      ingestSource: includeForwarded ? 'manual_backfill' : 'reconciliation',
    })

    const { error } = await supabase
      .from('booksy_raw_emails')
      .upsert({
        salon_id: mailbox.salon_id,
        booksy_gmail_account_id: mailbox.id,
        gmail_message_id: metadata.gmailMessageId,
        gmail_thread_id: metadata.gmailThreadId,
        gmail_history_id: metadata.gmailHistoryId,
        internal_date: metadata.internalDate,
        subject: metadata.subject,
        from_address: metadata.fromAddress,
        message_id_header: metadata.messageIdHeader,
        storage_path: metadata.storagePath,
        raw_sha256: metadata.rawSha256,
        ingest_source: includeForwarded ? 'manual_backfill' : 'reconciliation',
      }, {
        onConflict: 'booksy_gmail_account_id,gmail_message_id',
        ignoreDuplicates: true,
      })

    if (error) {
      throw new Error(`Failed to backfill raw email ${gmailMessageId}: ${error.message}`)
    }

    inserted += 1
    logger.info('Booksy reconciliation: raw email ledger row upserted', {
      action: 'booksy_reconcile_raw_upserted',
      salonId: mailbox.salon_id,
      accountId: mailbox.id,
      gmailMessageId,
      ingestSource: includeForwarded ? 'manual_backfill' : 'reconciliation',
    })
  }

  return inserted
}

async function reconcileMailbox(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow,
  windowStart: Date,
  windowEnd: Date,
  includeForwarded: boolean
): Promise<{
  runId: string
  emailsChecked: number
  emailsMissing: number
  emailsBackfilled: number
}> {
  const windowStartIso = windowStart.toISOString()
  const windowEndIso = windowEnd.toISOString()
  const run = await createRun(supabase, mailbox, windowStartIso, windowEndIso)

  try {
    // Reset parsed events that previously failed during apply so Fix E can retry them.
    // Also delete the failed ledger entries so the idempotency check doesn't block retry.
    try {
      const { data: failedLedgerRows } = await supabase
        .from('booksy_apply_ledger')
        .select('id, booksy_parsed_event_id')
        .eq('salon_id', mailbox.salon_id)
        .eq('operation', 'failed')

      if (failedLedgerRows && failedLedgerRows.length > 0) {
        const failedEventIds = failedLedgerRows
          .map((row) => row.booksy_parsed_event_id)
          .filter((id): id is string => typeof id === 'string')

        if (failedEventIds.length > 0) {
          await supabase
            .from('booksy_parsed_events')
            .update({ status: 'pending' })
            .eq('salon_id', mailbox.salon_id)
            .in('id', failedEventIds)

          await supabase
            .from('booksy_apply_ledger')
            .delete()
            .eq('salon_id', mailbox.salon_id)
            .eq('operation', 'failed')
            .in('booksy_parsed_event_id', failedEventIds)

          logger.info('Booksy reconciliation: reset failed apply events for retry', {
            action: 'booksy_reconcile_reset_apply_failed',
            salonId: mailbox.salon_id,
            accountId: mailbox.id,
            failedEventCount: failedEventIds.length,
          })
        }
      }
    } catch (error) {
      logger.warn('Booksy reconciliation: failed apply reset skipped', {
        action: 'booksy_reconcile_reset_apply_failed_skip',
        salonId: mailbox.salon_id,
        accountId: mailbox.id,
        error: error instanceof Error ? error.message : 'Unknown reset error',
      })
    }

    // Fix G2: Reset manual_review events with broken serviceName (pre-Fix-B parses where
    // normalizeBooksyBody returned empty and the full MIME body — including Mandrill tracking
    // links — was captured as serviceName). Filter in JS to avoid PostgREST JSONB ilike issues.
    // Deleting them and resetting the raw email to 'pending' causes the fixed parser to
    // re-process them on the next parse run.
    try {
      const { data: manualReviewEvents } = await supabase
      .from('booksy_parsed_events')
      .select('id, booksy_raw_email_id, payload')
      .eq('salon_id', mailbox.salon_id)
      .eq('status', 'manual_review')

    if (manualReviewEvents && manualReviewEvents.length > 0) {
      const brokenEvents = manualReviewEvents.filter((e) => {
        // Use JSON.stringify to catch mandrillapp.com anywhere in the payload regardless
        // of exact payload structure (handles both payload.serviceName and payload.parsed.serviceName).
        return JSON.stringify(e.payload ?? '').includes('mandrillapp.com')
      })

      if (brokenEvents.length > 0) {
        const rawEmailIdsToReset = brokenEvents
          .map((e) => e.booksy_raw_email_id)
          .filter((id): id is string => typeof id === 'string')

        const brokenEventIds = brokenEvents.map((e) => e.id)

        if (rawEmailIdsToReset.length > 0) {
          // Note: no gmail_account_id filter — the broken email may have been backfilled
          // through a different mailbox account_id but still belongs to this salon.
          await supabase
            .from('booksy_raw_emails')
            .update({ parse_status: 'pending' })
            .eq('salon_id', mailbox.salon_id)
            .in('id', rawEmailIdsToReset)
        }

        await supabase
          .from('booksy_parsed_events')
          .delete()
          .eq('salon_id', mailbox.salon_id)
          .in('id', brokenEventIds)

        logger.info('Booksy reconciliation: reset broken parsed events for re-parse', {
          action: 'booksy_reconcile_reset_broken_parses',
          salonId: mailbox.salon_id,
          accountId: mailbox.id,
          brokenEventCount: brokenEvents.length,
        })
      }
    }

    } catch (error) {
      logger.warn('Booksy reconciliation: broken parse reset skipped', {
        action: 'booksy_reconcile_reset_broken_parses_skip',
        salonId: mailbox.salon_id,
        accountId: mailbox.id,
        error: error instanceof Error ? error.message : 'Unknown reset error',
      })
    }

    logger.info('Booksy reconciliation: mailbox run started', {
      action: 'booksy_reconcile_mailbox_start',
      salonId: mailbox.salon_id,
      accountId: mailbox.id,
      emailAddress: mailbox.gmail_email,
      includeForwarded,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
    })

    const oauth2Client = await createOAuthClient(mailbox.id, supabase)
    const gmailMessageIds = await listMailboxMessageIds(oauth2Client, windowStart, includeForwarded)
    const existingMessageIds = await loadExistingMessageIds(supabase, mailbox)
    const missingIds = gmailMessageIds.filter((id) => !existingMessageIds.has(id))

    // Reset failed raw emails that are still visible in Gmail so parse can retry them.
    if (gmailMessageIds.length > 0) {
      try {
        const { error: resetError } = await supabase
          .from('booksy_raw_emails')
          .update({ parse_status: 'pending' })
          .eq('booksy_gmail_account_id', mailbox.id)
          .eq('parse_status', 'failed')
          .in('gmail_message_id', gmailMessageIds)

        if (resetError) {
          logger.warn('Booksy reconciliation: failed to reset failed raw emails for retry', {
            action: 'booksy_reconcile_reset_failed_warn',
            salonId: mailbox.salon_id,
            accountId: mailbox.id,
            error: resetError.message,
          })
        } else {
          logger.info('Booksy reconciliation: reset failed raw emails to pending for retry', {
            action: 'booksy_reconcile_reset_failed',
            salonId: mailbox.salon_id,
            accountId: mailbox.id,
          })
        }
      } catch (error) {
        logger.warn('Booksy reconciliation: failed raw email reset skipped', {
          action: 'booksy_reconcile_reset_failed_skip',
          salonId: mailbox.salon_id,
          accountId: mailbox.id,
          error: error instanceof Error ? error.message : 'Unknown reset error',
        })
      }
    }
    const emailsBackfilled = await backfillMissingEmails(
      supabase,
      mailbox,
      oauth2Client,
      missingIds,
      includeForwarded
    )

    logger.info('Booksy reconciliation: mailbox run completed', {
      action: 'booksy_reconcile_mailbox_completed',
      salonId: mailbox.salon_id,
      accountId: mailbox.id,
      emailAddress: mailbox.gmail_email,
      includeForwarded,
      emailsChecked: gmailMessageIds.length,
      existingCount: existingMessageIds.size,
      emailsMissing: missingIds.length,
      emailsBackfilled,
    })

    await updateRun(supabase, run.id, {
      status: 'completed',
      emails_checked: gmailMessageIds.length,
      emails_missing: missingIds.length,
      emails_backfilled: emailsBackfilled,
      error_message: null,
      completed_at: new Date().toISOString(),
    })

    return {
      runId: run.id,
      emailsChecked: gmailMessageIds.length,
      emailsMissing: missingIds.length,
      emailsBackfilled,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reconciliation error'

    await updateRun(supabase, run.id, {
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    })

    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = validateInternalCronHeader(request)
    if (authError) {
      return authError
    }

    const config = await parseRequestConfig(request)
    const supabase = createAdminClient()
    const mailboxes = await loadActiveMailboxes(supabase, config)

    logger.info('Booksy reconciliation: request received', {
      action: 'booksy_reconcile_start',
      accountId: config.accountId ?? null,
      includeForwarded: config.includeForwarded,
      windowDays: config.windowDays,
      syncFromDate: config.syncFromDate ?? null,
      mailboxCount: mailboxes.length,
    })

    if (mailboxes.length === 0) {
      return NextResponse.json({
        success: true,
        processedMailboxes: 0,
        results: [],
      })
    }

    const windowEnd = new Date()
    const requestedWindowStart = new Date(windowEnd.getTime() - config.windowDays * 24 * 60 * 60 * 1000)
    const results: Array<{
      accountId: string
      emailAddress: string
      runId?: string
      success: boolean
      windowStart?: string
      emailsChecked: number
      emailsMissing: number
      emailsBackfilled: number
      error?: string
    }> = []

    for (const mailbox of mailboxes) {
      try {
        const syncFromDate = config.syncFromDate ?? await loadSalonSyncFromDate(supabase, mailbox.salon_id)
        const windowStart = resolveEffectiveWindowStart(requestedWindowStart, syncFromDate)
        const result = await reconcileMailbox(
          supabase,
          mailbox,
          windowStart,
          windowEnd,
          config.includeForwarded
        )
        results.push({
          accountId: mailbox.id,
          emailAddress: mailbox.gmail_email,
          runId: result.runId,
          success: true,
          windowStart: windowStart.toISOString(),
          emailsChecked: result.emailsChecked,
          emailsMissing: result.emailsMissing,
          emailsBackfilled: result.emailsBackfilled,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown reconciliation error'

        logger.error('Booksy reconciliation mailbox failed', error, {
          action: 'booksy_reconcile_mailbox_failed',
          salonId: mailbox.salon_id,
          accountId: mailbox.id,
          emailAddress: mailbox.gmail_email,
        })

        results.push({
          accountId: mailbox.id,
          emailAddress: mailbox.gmail_email,
          success: false,
          emailsChecked: 0,
          emailsMissing: 0,
          emailsBackfilled: 0,
          error: message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      windowDays: config.windowDays,
      syncFromDate: config.syncFromDate ?? null,
      includeForwarded: config.includeForwarded,
      processedMailboxes: results.filter((result) => result.success).length,
      failedMailboxes: results.filter((result) => !result.success).length,
      emailsChecked: results.reduce((sum, result) => sum + result.emailsChecked, 0),
      emailsMissing: results.reduce((sum, result) => sum + result.emailsMissing, 0),
      emailsBackfilled: results.reduce((sum, result) => sum + result.emailsBackfilled, 0),
      results,
    })
  } catch (error) {
    logger.error('Booksy reconciliation fatal error', error, {
      action: 'booksy_reconcile_fatal',
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Booksy reconciliation failed' },
      { status: 500 }
    )
  }
}
