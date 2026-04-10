import { timingSafeEqual } from 'crypto'
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

type GmailMetadata = {
  gmailMessageId: string
  gmailThreadId: string | null
  gmailHistoryId: number | null
  internalDate: string | null
  subject: string | null
  fromAddress: string | null
  messageIdHeader: string | null
}

const RECONCILIATION_WINDOW_DAYS = 14

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

async function loadActiveMailboxes(supabase: AdminSupabaseClient): Promise<GmailAccountRow[]> {
  const { data, error } = await supabase
    .from('booksy_gmail_accounts')
    .select('*')
    .eq('is_active', true)
    .eq('auth_status', 'active')
    .order('created_at', { ascending: true })

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
  windowStart: Date
): Promise<string[]> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const messageIds = new Set<string>()
  let nextPageToken: string | undefined
  const afterSeconds = Math.floor(windowStart.getTime() / 1000)

  do {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `from:noreply@booksy.com after:${afterSeconds}`,
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

async function fetchGmailMetadata(
  oauth2Client: OAuth2Client,
  gmailMessageId: string
): Promise<GmailMetadata> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'metadata',
    metadataHeaders: ['Subject', 'From', 'Message-ID'],
  })

  const headers = response.data.payload?.headers ?? []

  return {
    gmailMessageId,
    gmailThreadId: response.data.threadId ?? null,
    gmailHistoryId: parseHistoryId(response.data.historyId),
    internalDate: parseInternalDate(response.data.internalDate),
    subject: getHeaderValue(headers, 'Subject'),
    fromAddress: getHeaderValue(headers, 'From'),
    messageIdHeader: getHeaderValue(headers, 'Message-ID'),
  }
}

async function backfillMissingEmails(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow,
  oauth2Client: OAuth2Client,
  missingIds: string[]
): Promise<number> {
  let inserted = 0

  for (const gmailMessageId of missingIds) {
    const metadata = await fetchGmailMetadata(oauth2Client, gmailMessageId)
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
        ingest_source: 'reconciliation',
      }, {
        onConflict: 'booksy_gmail_account_id,gmail_message_id',
        ignoreDuplicates: true,
      })

    if (error) {
      throw new Error(`Failed to backfill raw email ${gmailMessageId}: ${error.message}`)
    }

    inserted += 1
  }

  return inserted
}

async function reconcileMailbox(
  supabase: AdminSupabaseClient,
  mailbox: GmailAccountRow,
  windowStart: Date,
  windowEnd: Date
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
    const oauth2Client = await createOAuthClient(mailbox.id, supabase)
    const gmailMessageIds = await listMailboxMessageIds(oauth2Client, windowStart)
    const existingMessageIds = await loadExistingMessageIds(supabase, mailbox)
    const missingIds = gmailMessageIds.filter((id) => !existingMessageIds.has(id))
    const emailsBackfilled = await backfillMissingEmails(supabase, mailbox, oauth2Client, missingIds)

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

    const supabase = createAdminClient()
    const mailboxes = await loadActiveMailboxes(supabase)

    if (mailboxes.length === 0) {
      return NextResponse.json({
        success: true,
        processedMailboxes: 0,
        results: [],
      })
    }

    const windowEnd = new Date()
    const windowStart = new Date(windowEnd.getTime() - RECONCILIATION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const results: Array<{
      accountId: string
      emailAddress: string
      runId?: string
      success: boolean
      emailsChecked: number
      emailsMissing: number
      emailsBackfilled: number
      error?: string
    }> = []

    for (const mailbox of mailboxes) {
      try {
        const result = await reconcileMailbox(supabase, mailbox, windowStart, windowEnd)
        results.push({
          accountId: mailbox.id,
          emailAddress: mailbox.gmail_email,
          runId: result.runId,
          success: true,
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
