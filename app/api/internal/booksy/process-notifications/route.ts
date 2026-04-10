import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDecryptedTokens, encrypt } from '@/lib/booksy/gmail-auth'
import { getBooksyGmailRedirectUri } from '@/lib/google/get-google-redirect-uri'
import { logger } from '@/lib/logger'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Tables } from '@/types/supabase'

type AdminSupabaseClient = SupabaseClient<Database>
type NotificationRow = Tables<'booksy_gmail_notifications'>
type WatchRow = Tables<'booksy_gmail_watches'>
type AccountRow = Tables<'booksy_gmail_accounts'>

const RAW_EMAIL_BUCKET = 'booksy-raw-emails'
const MAILBOX_BATCH_LIMIT = 25

type PendingMailbox = {
  accountId: string
  salonId: string
  notifications: NotificationRow[]
}

type GmailMessageSummary = {
  gmailMessageId: string
  gmailThreadId: string | null
  gmailHistoryId: number | null
  internalDate: string | null
  subject: string | null
  fromAddress: string | null
  messageIdHeader: string | null
  rawMime: string
  storagePath: string
  rawSha256: string
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

function getHeaderValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string): string | null {
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

async function loadPendingMailboxes(supabase: AdminSupabaseClient): Promise<PendingMailbox[]> {
  const { data, error } = await supabase
    .from('booksy_gmail_notifications')
    .select('*')
    .eq('processing_status', 'pending')
    .order('received_at', { ascending: true })
    .limit(MAILBOX_BATCH_LIMIT * 10)

  if (error) {
    throw new Error(`Failed to load pending Booksy Gmail notifications: ${error.message}`)
  }

  const grouped = new Map<string, PendingMailbox>()

  for (const notification of data ?? []) {
    const existing = grouped.get(notification.booksy_gmail_account_id)

    if (!existing) {
      if (grouped.size >= MAILBOX_BATCH_LIMIT) {
        continue
      }

      grouped.set(notification.booksy_gmail_account_id, {
        accountId: notification.booksy_gmail_account_id,
        salonId: notification.salon_id,
        notifications: [notification],
      })
      continue
    }

    existing.notifications.push(notification)
  }

  return Array.from(grouped.values())
}

async function loadMailboxContext(
  supabase: AdminSupabaseClient,
  mailbox: PendingMailbox
): Promise<{ watch: WatchRow; account: AccountRow }> {
  const { data: watch, error: watchError } = await supabase
    .from('booksy_gmail_watches')
    .select('*')
    .eq('booksy_gmail_account_id', mailbox.accountId)
    .eq('salon_id', mailbox.salonId)
    .maybeSingle()

  if (watchError) {
    throw new Error(`Failed to load Booksy Gmail watch: ${watchError.message}`)
  }

  if (!watch) {
    throw new Error(`Missing Booksy Gmail watch for account ${mailbox.accountId}`)
  }

  const { data: account, error: accountError } = await supabase
    .from('booksy_gmail_accounts')
    .select('*')
    .eq('id', mailbox.accountId)
    .eq('salon_id', mailbox.salonId)
    .eq('is_active', true)
    .maybeSingle()

  if (accountError) {
    throw new Error(`Failed to load Booksy Gmail account: ${accountError.message}`)
  }

  if (!account) {
    throw new Error(`Missing active Booksy Gmail account ${mailbox.accountId}`)
  }

  return { watch, account }
}

async function listHistoryMessageIds(
  oauth2Client: OAuth2Client,
  startHistoryId: number
): Promise<{ messageIds: string[]; latestHistoryId: number | null }> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const messageIds = new Set<string>()
  let nextPageToken: string | undefined
  let latestHistoryId: number | null = null

  do {
    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: String(startHistoryId),
      historyTypes: ['messageAdded'],
      pageToken: nextPageToken,
      maxResults: 100,
    })

    latestHistoryId = parseHistoryId(response.data.historyId) ?? latestHistoryId

    for (const historyEntry of response.data.history ?? []) {
      for (const added of historyEntry.messagesAdded ?? []) {
        const messageId = added.message?.id
        if (messageId) {
          messageIds.add(messageId)
        }
      }
    }

    nextPageToken = response.data.nextPageToken ?? undefined
  } while (nextPageToken)

  return {
    messageIds: Array.from(messageIds),
    latestHistoryId,
  }
}

async function fetchMessageSummary(
  oauth2Client: OAuth2Client,
  salonId: string,
  accountId: string,
  gmailMessageId: string
): Promise<GmailMessageSummary> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'raw',
  })

  const rawMime = response.data.raw
  if (!rawMime) {
    throw new Error(`Gmail message ${gmailMessageId} does not contain raw MIME`)
  }

  const headers = response.data.payload?.headers ?? []
  const internalDate = parseInternalDate(response.data.internalDate)
  const internalDateSource = internalDate ? new Date(internalDate) : new Date()
  const year = internalDateSource.getUTCFullYear()
  const month = String(internalDateSource.getUTCMonth() + 1).padStart(2, '0')
  const rawSha256 = createHash('sha256').update(rawMime).digest('hex')
  const storagePath = `${salonId}/${accountId}/${year}/${month}/${gmailMessageId}.eml`

  return {
    gmailMessageId,
    gmailThreadId: response.data.threadId ?? null,
    gmailHistoryId: parseHistoryId(response.data.historyId),
    internalDate,
    subject: getHeaderValue(headers, 'subject'),
    fromAddress: getHeaderValue(headers, 'from'),
    messageIdHeader: getHeaderValue(headers, 'message-id'),
    rawMime,
    storagePath,
    rawSha256,
  }
}

async function persistRawMime(
  supabase: AdminSupabaseClient,
  summary: GmailMessageSummary
): Promise<void> {
  const buffer = Buffer.from(summary.rawMime, 'base64url')
  const { error } = await supabase.storage
    .from(RAW_EMAIL_BUCKET)
    .upload(summary.storagePath, buffer, {
      upsert: true,
      contentType: 'message/rfc822',
    })

  if (error) {
    throw new Error(`Failed to store raw Booksy email MIME: ${error.message}`)
  }
}

async function insertRawEmail(
  supabase: AdminSupabaseClient,
  mailbox: PendingMailbox,
  summary: GmailMessageSummary
): Promise<void> {
  const { error } = await supabase
    .from('booksy_raw_emails')
    .upsert({
      salon_id: mailbox.salonId,
      booksy_gmail_account_id: mailbox.accountId,
      gmail_message_id: summary.gmailMessageId,
      gmail_thread_id: summary.gmailThreadId,
      gmail_history_id: summary.gmailHistoryId,
      internal_date: summary.internalDate,
      subject: summary.subject,
      from_address: summary.fromAddress,
      message_id_header: summary.messageIdHeader,
      storage_path: summary.storagePath,
      raw_sha256: summary.rawSha256,
      ingest_source: 'watch',
    }, {
      onConflict: 'booksy_gmail_account_id,gmail_message_id',
      ignoreDuplicates: true,
    })

  if (error) {
    throw new Error(`Failed to insert Booksy raw email: ${error.message}`)
  }
}

async function markNotificationsProcessed(
  supabase: AdminSupabaseClient,
  notifications: NotificationRow[]
): Promise<void> {
  const { error } = await supabase
    .from('booksy_gmail_notifications')
    .update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .in('id', notifications.map((notification) => notification.id))

  if (error) {
    throw new Error(`Failed to mark Booksy Gmail notifications processed: ${error.message}`)
  }
}

async function markNotificationsFailed(
  supabase: AdminSupabaseClient,
  notifications: NotificationRow[],
  message: string
): Promise<void> {
  const { error } = await supabase
    .from('booksy_gmail_notifications')
    .update({
      processing_status: 'failed',
      error_message: message,
    })
    .in('id', notifications.map((notification) => notification.id))

  if (error) {
    logger.error('Booksy notification worker: failed to mark notifications failed', error, {
      action: 'booksy_notification_mark_failed_error',
    })
  }
}

async function markNeedsFullSync(
  supabase: AdminSupabaseClient,
  watch: WatchRow,
  message: string
): Promise<void> {
  const { error } = await (supabase
    .from('booksy_gmail_watches') as any)
    .update({
      needs_full_sync: true,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watch.id)

  if (error) {
    throw new Error(`Failed to mark Booksy Gmail watch for full sync: ${error.message}`)
  }
}

async function updateWatchCursor(
  supabase: AdminSupabaseClient,
  watch: WatchRow,
  latestHistoryId: number | null
): Promise<void> {
  const { error } = await supabase
    .from('booksy_gmail_watches')
    .update({
      last_history_id: latestHistoryId,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', watch.id)

  if (error) {
    throw new Error(`Failed to update Booksy Gmail watch cursor: ${error.message}`)
  }
}

async function processMailbox(
  supabase: AdminSupabaseClient,
  mailbox: PendingMailbox
): Promise<{ processed: boolean; messageCount: number; fullSyncRequired: boolean }> {
  const { watch } = await loadMailboxContext(supabase, mailbox)

  if (!watch.last_history_id) {
    throw new Error(`Booksy Gmail watch ${watch.id} is missing last_history_id`)
  }

  const oauth2Client = await createOAuthClient(mailbox.accountId, supabase)

  try {
    const { messageIds, latestHistoryId } = await listHistoryMessageIds(oauth2Client, watch.last_history_id)

    for (const gmailMessageId of messageIds) {
      const summary = await fetchMessageSummary(oauth2Client, mailbox.salonId, mailbox.accountId, gmailMessageId)
      await persistRawMime(supabase, summary)
      await insertRawEmail(supabase, mailbox, summary)
    }

    await updateWatchCursor(supabase, watch, latestHistoryId ?? watch.last_history_id)
    await markNotificationsProcessed(supabase, mailbox.notifications)

    return {
      processed: true,
      messageCount: messageIds.length,
      fullSyncRequired: false,
    }
  } catch (error) {
    const status = (error as { code?: number; status?: number })?.status ?? (error as { code?: number })?.code

    if (status === 404) {
      const message = 'Gmail history cursor expired; full sync required'
      await markNeedsFullSync(supabase, watch, message)
      await markNotificationsProcessed(supabase, mailbox.notifications)

      logger.warn('Booksy notification worker: Gmail history cursor expired', {
        action: 'booksy_notification_full_sync_required',
        salonId: mailbox.salonId,
        accountId: mailbox.accountId,
      })

      return {
        processed: true,
        messageCount: 0,
        fullSyncRequired: true,
      }
    }

    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = validateCronSecret(request)
    if (authError) {
      return authError
    }

    const supabase = createAdminClient()
    const pendingMailboxes = await loadPendingMailboxes(supabase)

    if (pendingMailboxes.length === 0) {
      return NextResponse.json({
        success: true,
        processedMailboxes: 0,
        processedNotifications: 0,
        rawEmailsDiscovered: 0,
      })
    }

    const results: Array<{
      accountId: string
      processed: boolean
      notificationCount: number
      rawEmailsDiscovered: number
      fullSyncRequired: boolean
      error?: string
    }> = []

    for (const mailbox of pendingMailboxes) {
      try {
        const result = await processMailbox(supabase, mailbox)
        results.push({
          accountId: mailbox.accountId,
          processed: result.processed,
          notificationCount: mailbox.notifications.length,
          rawEmailsDiscovered: result.messageCount,
          fullSyncRequired: result.fullSyncRequired,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown mailbox processing error'
        await markNotificationsFailed(supabase, mailbox.notifications, message)

        logger.error('Booksy notification worker: mailbox processing failed', error, {
          action: 'booksy_notification_mailbox_failed',
          salonId: mailbox.salonId,
          accountId: mailbox.accountId,
        })

        results.push({
          accountId: mailbox.accountId,
          processed: false,
          notificationCount: mailbox.notifications.length,
          rawEmailsDiscovered: 0,
          fullSyncRequired: false,
          error: message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      processedMailboxes: results.filter((result) => result.processed).length,
      processedNotifications: results
        .filter((result) => result.processed)
        .reduce((sum, result) => sum + result.notificationCount, 0),
      rawEmailsDiscovered: results.reduce((sum, result) => sum + result.rawEmailsDiscovered, 0),
      results,
      warnings: [
        'Mailbox-level FOR UPDATE SKIP LOCKED could not be held across Gmail API work with the current app stack; this route deduplicates per mailbox within one invocation but still needs a DB-backed claim primitive for cross-worker isolation.',
        'The current generated schema does not include booksy_gmail_watches.needs_full_sync; 404 handling assumes that column exists in the linked database.',
      ],
    })
  } catch (error) {
    logger.error('Booksy notification worker fatal error', error, {
      action: 'booksy_notification_fatal',
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Booksy notification worker failed' },
      { status: 500 }
    )
  }
}
