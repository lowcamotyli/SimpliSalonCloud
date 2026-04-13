import type { SupabaseClient } from '@supabase/supabase-js'

export interface MailboxHealth {
  accountId: string
  email: string
  authStatus: 'active' | 'revoked' | 'expired' | 'error'
  watchStatus: 'active' | 'expired' | 'error' | 'pending' | 'stopped' | null
  watchExpiresAt: string | null
  lastNotificationAt: string | null
  rawBacklog: number
  parseFailureRate: number
  manualQueueDepth: number
  applyFailures: number
  lastReconciliationMissing: number | null
  overall: 'ok' | 'warning' | 'critical'
}

type SalonHealth = {
  overall: 'ok' | 'warning' | 'critical'
  mailboxes: MailboxHealth[]
}

type GmailAccountRow = {
  id: string
  gmail_email: string
  auth_status: MailboxHealth['authStatus']
}

type GmailWatchRow = {
  watch_status: Exclude<MailboxHealth['watchStatus'], null>
  watch_expiration: string | null
  last_notification_at: string | null
}

function toCount(value: number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return 0
}

function hoursUntil(timestampIso: string, nowMs: number): number {
  const targetMs = new Date(timestampIso).getTime()

  if (!Number.isFinite(targetMs)) {
    return Number.POSITIVE_INFINITY
  }

  return (targetMs - nowMs) / (60 * 60 * 1000)
}

function minutesSince(timestampIso: string, nowMs: number): number {
  const targetMs = new Date(timestampIso).getTime()

  if (!Number.isFinite(targetMs)) {
    return Number.POSITIVE_INFINITY
  }

  return (nowMs - targetMs) / (60 * 1000)
}

function inferOverall(mailbox: Omit<MailboxHealth, 'overall'>, now: Date): MailboxHealth['overall'] {
  const nowMs = now.getTime()
  const NOTIFICATION_WARNING_MINUTES = 30
  const NOTIFICATION_CRITICAL_MINUTES = 120

  if (mailbox.authStatus === 'revoked' || mailbox.authStatus === 'expired') {
    return 'critical'
  }

  if (mailbox.watchExpiresAt !== null) {
    const watchHours = hoursUntil(mailbox.watchExpiresAt, nowMs)
    if (watchHours < 1) {
      return 'critical'
    }
  }

  if (mailbox.lastNotificationAt !== null && isBusinessHours(now)) {
    const notificationMinutes = minutesSince(mailbox.lastNotificationAt, nowMs)
    if (notificationMinutes > NOTIFICATION_CRITICAL_MINUTES) {
      return 'critical'
    }
  }

  if (mailbox.watchExpiresAt !== null) {
    const watchHours = hoursUntil(mailbox.watchExpiresAt, nowMs)
    if (watchHours < 12) {
      return 'warning'
    }
  }

  if (mailbox.parseFailureRate > 0.1) {
    return 'warning'
  }

  if (mailbox.lastNotificationAt !== null && isBusinessHours(now)) {
    const notificationMinutes = minutesSince(mailbox.lastNotificationAt, nowMs)
    if (notificationMinutes > NOTIFICATION_WARNING_MINUTES) {
      return 'warning'
    }
  }

  return 'ok'
}

export function isBusinessHours(now: Date): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const weekdayPart = parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'weekday')
  const hourPart = parts.find((part: Intl.DateTimeFormatPart): boolean => part.type === 'hour')

  if (!weekdayPart || !hourPart) {
    return false
  }

  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }

  const dayNumber = dayMap[weekdayPart.value]
  const hour = Number(hourPart.value)

  if (!dayNumber || !Number.isFinite(hour)) {
    return false
  }

  return dayNumber >= 1 && dayNumber <= 5 && hour >= 8 && hour < 20
}

async function getRawEmailIds(
  accountId: string,
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from('booksy_raw_emails')
    .select('id')
    .eq('booksy_gmail_account_id', accountId)

  if (error) {
    throw new Error(`Failed to load raw email IDs: ${error.message}`)
  }

  const rawEmailIds: string[] = []

  for (const row of data ?? []) {
    if (typeof row.id === 'string' && row.id.length > 0) {
      rawEmailIds.push(row.id)
    }
  }

  return rawEmailIds
}

async function getParsedEventIds(
  rawEmailIds: string[],
  supabase: SupabaseClient
): Promise<string[]> {
  if (rawEmailIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('booksy_parsed_events')
    .select('id')
    .in('booksy_raw_email_id', rawEmailIds)

  if (error) {
    throw new Error(`Failed to load parsed event IDs: ${error.message}`)
  }

  const parsedEventIds: string[] = []

  for (const row of data ?? []) {
    if (typeof row.id === 'string' && row.id.length > 0) {
      parsedEventIds.push(row.id)
    }
  }

  return parsedEventIds
}

export async function getMailboxHealth(
  accountId: string,
  supabase: SupabaseClient
): Promise<MailboxHealth> {
  const [{ data: account, error: accountError }, { data: watch, error: watchError }] = await Promise.all([
    supabase
      .from('booksy_gmail_accounts')
      .select('id, gmail_email, auth_status')
      .eq('id', accountId)
      .single<GmailAccountRow>(),
    supabase
      .from('booksy_gmail_watches')
      .select('watch_status, watch_expiration, last_notification_at')
      .eq('booksy_gmail_account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<GmailWatchRow>(),
  ])

  if (accountError) {
    throw new Error(`Failed to load Booksy Gmail account: ${accountError.message}`)
  }

  if (!account) {
    throw new Error(`Booksy Gmail account not found for accountId ${accountId}`)
  }

  if (watchError) {
    throw new Error(`Failed to load Booksy Gmail watch: ${watchError.message}`)
  }

  const now = new Date()
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [rawBacklogCount, parseRowsResult, rawEmailIds, reconciliationResult] = await Promise.all([
    supabase
      .from('booksy_raw_emails')
      .select('id', { count: 'exact', head: true })
      .eq('booksy_gmail_account_id', accountId)
      .eq('parse_status', 'pending'),
    supabase
      .from('booksy_raw_emails')
      .select('parse_status')
      .eq('booksy_gmail_account_id', accountId)
      .gte('created_at', sinceIso),
    getRawEmailIds(accountId, supabase),
    supabase
      .from('booksy_reconciliation_runs')
      .select('emails_missing')
      .eq('booksy_gmail_account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ emails_missing: number | null }>(),
  ])

  if (rawBacklogCount.error) {
    throw new Error(`Failed to load raw backlog: ${rawBacklogCount.error.message}`)
  }

  if (parseRowsResult.error) {
    throw new Error(`Failed to load parse stats: ${parseRowsResult.error.message}`)
  }

  if (reconciliationResult.error) {
    throw new Error(`Failed to load reconciliation stats: ${reconciliationResult.error.message}`)
  }

  let parsedCount = 0
  let failedCount = 0

  for (const row of parseRowsResult.data ?? []) {
    if (row.parse_status === 'parsed') {
      parsedCount += 1
    }

    if (row.parse_status === 'failed') {
      failedCount += 1
    }
  }

  const parseTotal = parsedCount + failedCount
  const parseFailureRate = parseTotal === 0 ? 0 : failedCount / parseTotal

  const [manualQueueResult, applyFailuresResult] = await Promise.all([
    rawEmailIds.length > 0
      ? supabase
          .from('booksy_parsed_events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'manual_review')
          .in('booksy_raw_email_id', rawEmailIds)
      : Promise.resolve({ count: 0, error: null }),
    (async (): Promise<{ count: number | null; error: { message: string } | null }> => {
      const parsedEventIds = await getParsedEventIds(rawEmailIds, supabase)

      if (parsedEventIds.length === 0) {
        return { count: 0, error: null }
      }

      const { count, error } = await supabase
        .from('booksy_apply_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('operation', 'failed')
        .gte('applied_at', sinceIso)
        .in('booksy_parsed_event_id', parsedEventIds)

      if (error) {
        return { count: null, error: { message: error.message } }
      }

      return { count, error: null }
    })(),
  ])

  if (manualQueueResult.error) {
    throw new Error(`Failed to load manual queue depth: ${manualQueueResult.error.message}`)
  }

  if (applyFailuresResult.error) {
    throw new Error(`Failed to load apply failures: ${applyFailuresResult.error.message}`)
  }

  const base: Omit<MailboxHealth, 'overall'> = {
    accountId: account.id,
    email: account.gmail_email,
    authStatus: account.auth_status,
    watchStatus: watch?.watch_status ?? null,
    watchExpiresAt: watch?.watch_expiration ?? null,
    lastNotificationAt: watch?.last_notification_at ?? null,
    rawBacklog: toCount(rawBacklogCount.count),
    parseFailureRate,
    manualQueueDepth: toCount(manualQueueResult.count),
    applyFailures: toCount(applyFailuresResult.count),
    lastReconciliationMissing: reconciliationResult.data?.emails_missing ?? null,
  }

  return {
    ...base,
    overall: inferOverall(base, now),
  }
}

export async function getSalonHealth(
  salonId: string,
  supabase: SupabaseClient
): Promise<SalonHealth> {
  const { data, error } = await supabase
    .from('booksy_gmail_accounts')
    .select('id')
    .eq('salon_id', salonId)
    .eq('is_active', true)

  if (error) {
    throw new Error(`Failed to load salon Booksy Gmail accounts: ${error.message}`)
  }

  const mailboxes = await Promise.all(
    (data ?? [])
      .map((row): string | null => (typeof row.id === 'string' && row.id.length > 0 ? row.id : null))
      .filter((id): id is string => id !== null)
      .map((accountId: string): Promise<MailboxHealth> => getMailboxHealth(accountId, supabase))
  )

  let overall: SalonHealth['overall'] = 'ok'

  for (const [, mailbox] of mailboxes.entries()) {
    if (mailbox.overall === 'critical') {
      overall = 'critical'
      break
    }

    if (mailbox.overall === 'warning') {
      overall = 'warning'
    }
  }

  return {
    overall,
    mailboxes,
  }
}
