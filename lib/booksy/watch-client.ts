import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'
import { encrypt, getDecryptedTokens } from '@/lib/booksy/gmail-auth'
import { getBooksyGmailRedirectUri } from '@/lib/google/get-google-redirect-uri'
import type { Database, Tables } from '@/types/supabase'

type AdminSupabaseClient = SupabaseClient<Database>
type GmailAccountRow = Tables<'booksy_gmail_accounts'>
type GmailWatchRow = Tables<'booksy_gmail_watches'>

type WatchApiResponse = {
  expiration: string | null
  historyId: number | null
}

export type BooksyWatchResult = {
  accountId: string
  emailAddress: string
  historyId: number | null
  watchExpiration: string | null
  watchStatus: GmailWatchRow['watch_status']
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function isWatchEnabled(): boolean {
  const raw = process.env.BOOKSY_USE_WATCH

  if (!raw) {
    return false
  }

  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function getTopicName(): string {
  return requireEnv('GOOGLE_BOOKSY_PUBSUB_TOPIC')
}

function parseHistoryId(historyId: unknown): number | null {
  if (typeof historyId === 'number' && Number.isFinite(historyId)) {
    return historyId
  }

  if (typeof historyId === 'string' && historyId.length > 0) {
    const parsed = Number(historyId)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseExpiration(expiration: unknown): string | null {
  if (typeof expiration !== 'string' || expiration.length === 0) {
    return null
  }

  const parsed = Number(expiration)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return new Date(parsed).toISOString()
}

function isInvalidGrantError(error: unknown): boolean {
  const details = JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    code: (error as { code?: unknown } | null | undefined)?.code,
    status: (error as { status?: unknown } | null | undefined)?.status,
    response: (error as { response?: { data?: unknown } } | null | undefined)?.response?.data,
    errors: (error as { errors?: unknown } | null | undefined)?.errors,
  })

  return /invalid_grant/i.test(details)
}

async function resolveSalonAccount(
  supabase: AdminSupabaseClient,
  salonId: string,
  accountId?: string
): Promise<GmailAccountRow> {
  if (!salonId) {
    throw new Error('salonId is required')
  }

  let query = supabase
    .from('booksy_gmail_accounts')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)

  if (accountId) {
    query = query.eq('id', accountId)
  } else {
    query = query
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Failed to load Booksy Gmail account: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No active Booksy Gmail account found for salon ${salonId}`)
  }

  return data
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

async function callWatch(accountId: string, supabase: AdminSupabaseClient): Promise<WatchApiResponse> {
  const auth = await createOAuthClient(accountId, supabase)
  const gmail = google.gmail({ version: 'v1', auth })
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: getTopicName(),
      labelIds: ['INBOX'],
    },
  })

  return {
    expiration: parseExpiration(response.data.expiration),
    historyId: parseHistoryId(response.data.historyId),
  }
}

async function persistWatchSuccess(
  supabase: AdminSupabaseClient,
  account: GmailAccountRow,
  result: WatchApiResponse,
  renewalCount: number
): Promise<BooksyWatchResult> {
  const now = new Date().toISOString()
  const payload: Database['public']['Tables']['booksy_gmail_watches']['Insert'] = {
    salon_id: account.salon_id,
    booksy_gmail_account_id: account.id,
    watch_status: 'active',
    last_history_id: result.historyId,
    watch_expiration: result.expiration,
    last_error: null,
    renewal_count: renewalCount,
    updated_at: now,
  }

  const { error } = await supabase
    .from('booksy_gmail_watches')
    .upsert(payload, { onConflict: 'booksy_gmail_account_id' })

  if (error) {
    throw new Error(`Failed to persist Booksy Gmail watch: ${error.message}`)
  }

  const { error: accountError } = await supabase
    .from('booksy_gmail_accounts')
    .update({
      auth_status: 'active',
      last_auth_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq('id', account.id)

  if (accountError) {
    throw new Error(`Failed to persist Booksy Gmail auth status: ${accountError.message}`)
  }

  return {
    accountId: account.id,
    emailAddress: account.gmail_email,
    historyId: result.historyId,
    watchExpiration: result.expiration,
    watchStatus: 'active',
  }
}

async function persistWatchError(
  supabase: AdminSupabaseClient,
  account: GmailAccountRow,
  message: string
): Promise<void> {
  await supabase
    .from('booksy_gmail_watches')
    .upsert({
      salon_id: account.salon_id,
      booksy_gmail_account_id: account.id,
      watch_status: 'error',
      last_error: message,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'booksy_gmail_account_id' })
}

async function persistAccountAuthError(
  supabase: AdminSupabaseClient,
  account: GmailAccountRow,
  message: string
): Promise<void> {
  await supabase
    .from('booksy_gmail_accounts')
    .update({
      auth_status: 'revoked',
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id)
}

export async function startWatch(
  salonId: string,
  supabase: AdminSupabaseClient,
  accountId?: string
): Promise<BooksyWatchResult> {
  if (!isWatchEnabled()) {
    throw new Error('BOOKSY_USE_WATCH is disabled')
  }

  const account = await resolveSalonAccount(supabase, salonId, accountId)

  try {
    const result = await callWatch(account.id, supabase)
    return await persistWatchSuccess(supabase, account, result, 0)
  } catch (error) {
    const invalidGrant = isInvalidGrantError(error)
    const message = invalidGrant
      ? 'Gmail authorization expired. Reconnect Gmail account.'
      : error instanceof Error ? error.message : 'Unknown Gmail watch start error'
    await persistWatchError(supabase, account, message)
    if (invalidGrant) {
      await persistAccountAuthError(supabase, account, message)
      throw new AppError(message, 'GMAIL_REAUTH_REQUIRED', 401, {
        salonId: account.salon_id,
        accountId: account.id,
      })
    }
    throw error
  }
}

export async function renewWatch(
  salonId: string,
  supabase: AdminSupabaseClient,
  accountId?: string
): Promise<BooksyWatchResult> {
  if (!isWatchEnabled()) {
    throw new Error('BOOKSY_USE_WATCH is disabled')
  }

  const account = await resolveSalonAccount(supabase, salonId, accountId)
  const { data: existingWatch, error: watchError } = await supabase
    .from('booksy_gmail_watches')
    .select('renewal_count')
    .eq('booksy_gmail_account_id', account.id)
    .maybeSingle()

  if (watchError) {
    throw new Error(`Failed to load existing Booksy Gmail watch: ${watchError.message}`)
  }

  try {
    const result = await callWatch(account.id, supabase)
    const renewalCount = (existingWatch?.renewal_count ?? 0) + 1
    return await persistWatchSuccess(supabase, account, result, renewalCount)
  } catch (error) {
    const invalidGrant = isInvalidGrantError(error)
    const message = invalidGrant
      ? 'Gmail authorization expired. Reconnect Gmail account.'
      : error instanceof Error ? error.message : 'Unknown Gmail watch renewal error'
    await persistWatchError(supabase, account, message)
    if (invalidGrant) {
      await persistAccountAuthError(supabase, account, message)
      throw new AppError(message, 'GMAIL_REAUTH_REQUIRED', 401, {
        salonId: account.salon_id,
        accountId: account.id,
      })
    }
    throw error
  }
}

export async function stopWatch(
  salonId: string,
  supabase: AdminSupabaseClient,
  accountId?: string
): Promise<BooksyWatchResult> {
  const account = await resolveSalonAccount(supabase, salonId, accountId)
  const auth = await createOAuthClient(account.id, supabase)
  const gmail = google.gmail({ version: 'v1', auth })

  await gmail.users.stop({ userId: 'me' })

  const { data: watch, error } = await supabase
    .from('booksy_gmail_watches')
    .upsert({
      salon_id: account.salon_id,
      booksy_gmail_account_id: account.id,
      watch_status: 'stopped',
      watch_expiration: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'booksy_gmail_account_id' })
    .select('watch_status, last_history_id, watch_expiration')
    .single()

  if (error) {
    throw new Error(`Failed to stop Booksy Gmail watch: ${error.message}`)
  }

  return {
    accountId: account.id,
    emailAddress: account.gmail_email,
    historyId: watch.last_history_id,
    watchExpiration: watch.watch_expiration,
    watchStatus: watch.watch_status,
  }
}
