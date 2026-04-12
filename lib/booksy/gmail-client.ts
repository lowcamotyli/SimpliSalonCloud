import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getBooksyGmailRedirectUri } from '@/lib/google/get-google-redirect-uri'
import { logger } from '@/lib/logger'

interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  body: string
  date: string
  internalDate?: string | null
  rawEmailId?: string | null
}

type GmailClientOptions = {
  onTokens?: (tokens: { access_token?: string; refresh_token?: string; expiry_date?: number }) => Promise<void> | void
  ledger?: {
    supabase: SupabaseClient<any>
    salonId: string
    booksyGmailAccountId?: string | null
  }
}

type SearchBooksyEmailsOptions = {
  syncFromDate?: string | null
}

export class GmailClient {
  private gmail: any
  private oauth2Client: any
  private ledger?: GmailClientOptions['ledger']

  constructor(
    credentials: { access_token?: string; refresh_token?: string; expiry_date?: number },
    options?: GmailClientOptions
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getBooksyGmailRedirectUri()
    )

    this.oauth2Client.setCredentials(credentials)
    this.ledger = options?.ledger
    this.oauth2Client.on('tokens', async (tokens: any) => {
      if (!options?.onTokens) return

      const mergedTokens = GmailClient.mergeTokens(credentials, tokens)
      credentials.access_token = mergedTokens.access_token
      credentials.refresh_token = mergedTokens.refresh_token
      credentials.expiry_date = mergedTokens.expiry_date

      try {
        await options.onTokens(mergedTokens)
      } catch (error) {
        logger.error('Gmail: failed to persist refreshed tokens', error)
      }
    })
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  /**
   * Static helper to get OAuth URL
   */
  static getAuthUrl(state?: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getBooksyGmailRedirectUri()
    )

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      prompt: 'consent',
      state,
    })
  }

  /**
   * Static helper to get tokens from code
   */
  static async getTokens(code: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getBooksyGmailRedirectUri()
    )

    const { tokens } = await oauth2Client.getToken(code)
    return tokens
  }

  /**
   * Preserve refresh_token if Google returns only a new access token.
   */
  static mergeTokens(
    current: { access_token?: string; refresh_token?: string; expiry_date?: number } | null | undefined,
    incoming: { access_token?: string; refresh_token?: string; expiry_date?: number } | null | undefined
  ) {
    return {
      access_token: incoming?.access_token ?? current?.access_token,
      refresh_token: incoming?.refresh_token ?? current?.refresh_token,
      expiry_date: incoming?.expiry_date ?? current?.expiry_date,
    }
  }

  /**
   * Detect Google OAuth refresh-token failures (revoked/expired token).
   */
  static isInvalidGrantError(error: any): boolean {
    const details = JSON.stringify({
      message: error?.message,
      code: error?.code,
      status: error?.status,
      response: error?.response?.data,
      errors: error?.errors,
    })

    return /invalid_grant/i.test(details)
  }

  /**
   * Get user's email address
   */
  async getUserEmail(): Promise<string | null> {
    try {
      const response = await this.gmail.users.getProfile({ userId: 'me' })
      return response.data.emailAddress || null
    } catch (error) {
      logger.error('Gmail: getUserEmail failed', error)
      return null
    }
  }

  /**
   * Search for Booksy emails (new bookings, cancellations, reschedules)
   */
  async searchBooksyEmails(
    maxResults = 20,
    senderFilter = '@booksy.com',
    options?: SearchBooksyEmailsOptions
  ): Promise<GmailMessage[]> {
    try {
      const sender = senderFilter.trim() || '@booksy.com'
      const syncFromFilter = GmailClient.toGmailAfterFilter(options?.syncFromDate)
      const commonFilters = ['-label:booksy/processed', '-label:booksy/error', syncFromFilter]
        .filter(Boolean)
        .join(' ')

      // Run separate queries for each email type Booksy sends
      const queries = [
        `from:${sender} subject:"nowa rezerwacja" ${commonFilters}`,
        `from:${sender} subject:"odwołała wizytę" ${commonFilters}`,
        `from:${sender} subject:"odwołał wizytę" ${commonFilters}`,
        `from:${sender} subject:"zmienił rezerwację" ${commonFilters}`,
      ]

      const seenIds = new Set<string>()
      const fullMessages: GmailMessage[] = []

      for (const query of queries) {
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults,
        })

        const messages = response.data.messages || []
        logger.debug('Gmail: query executed', { action: 'gmail_search', query, found: messages.length })

        for (const message of messages) {
          if (seenIds.has(message.id)) continue
          seenIds.add(message.id)

          const fullMessage = await this.getFullMessage(message.id)
          if (fullMessage) {
            fullMessage.rawEmailId = await this.insertRawEmailLedgerEntry(fullMessage)
            fullMessages.push(fullMessage)
          }
        }
      }

      logger.info('Gmail: Booksy emails fetched', { action: 'gmail_fetch', count: fullMessages.length })
      return fullMessages
    } catch (error) {
      if (GmailClient.isInvalidGrantError(error)) {
        logger.warn('Gmail: token expired, re-auth required', { action: 'gmail_reauth' })
        const authError = new Error('Gmail authorization expired. Reconnect Gmail account.')
          ; (authError as any).code = 'GMAIL_REAUTH_REQUIRED'
          ; (authError as any).cause = error
        throw authError
      }
      logger.error('Gmail: searchBooksyEmails failed', error)
      throw error
    }
  }

  private static toGmailAfterFilter(syncFromDate?: string | null): string {
    if (!syncFromDate) {
      return ''
    }

    const match = syncFromDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) {
      return ''
    }

    return `after:${match[1]}/${match[2]}/${match[3]}`
  }

  /**
   * Get full message details
   */
  private async getFullMessage(messageId: string): Promise<GmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      const message = response.data
      const headers = message.payload?.headers || []

      const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || ''
      const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || ''
      const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || ''
      const parsedInternalDateMs =
        typeof message.internalDate === 'string' && message.internalDate.length > 0
          ? Number(message.internalDate)
          : Number.NaN
      const internalDate = Number.isFinite(parsedInternalDateMs)
        ? new Date(parsedInternalDateMs).toISOString()
        : null

      let body = ''

      const extractBody = (part: any): string => {
        if (part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
        if (part.parts) {
          for (const p of part.parts) {
            const b = extractBody(p)
            if (b) return b
          }
        }
        return ''
      }

      body = extractBody(message.payload)

      return {
        id: messageId,
        threadId: message.threadId || '',
        subject,
        from,
        body,
        date,
        internalDate,
        rawEmailId: null,
      }
    } catch (error) {
      logger.error('Gmail: getFullMessage failed', error, { messageId })
      return null
    }
  }

  private isLedgerEnabled(): boolean {
    return process.env.BOOKSY_LEDGER_ENABLED !== 'false'
  }

  private async resolveBooksyGmailAccountId(): Promise<string | null> {
    if (!this.ledger) return null
    if (this.ledger.booksyGmailAccountId) return this.ledger.booksyGmailAccountId

    const email = await this.getUserEmail()
    if (!email) {
      logger.warn('Gmail: skipping raw email ledger insert because mailbox email could not be resolved', {
        action: 'booksy_raw_email_skip_no_mailbox_email',
        salonId: this.ledger.salonId,
      })
      return null
    }

    const { data, error } = await (this.ledger.supabase
      .from('booksy_gmail_accounts') as any)
      .select('id')
      .eq('salon_id', this.ledger.salonId)
      .eq('gmail_email', email)
      .maybeSingle()

    if (error) {
      logger.warn('Gmail: failed to resolve Booksy Gmail account for raw email ledger insert', {
        action: 'booksy_raw_email_lookup_failed',
        salonId: this.ledger.salonId,
        email,
        error: error.message,
      })
      return null
    }

    const accountId = data?.id ?? null

    if (!accountId) {
      logger.warn('Gmail: skipping raw email ledger insert because mailbox account was not found', {
        action: 'booksy_raw_email_skip_missing_mailbox',
        salonId: this.ledger.salonId,
        email,
      })
      return null
    }

    this.ledger.booksyGmailAccountId = accountId
    return accountId
  }

  private async insertRawEmailLedgerEntry(message: GmailMessage): Promise<string | null> {
    if (!this.isLedgerEnabled() || !this.ledger) {
      return null
    }

    const booksyGmailAccountId = await this.resolveBooksyGmailAccountId()
    if (!booksyGmailAccountId) {
      return null
    }

    const { data, error } = await (this.ledger.supabase
      .from('booksy_raw_emails') as any)
      .insert({
        salon_id: this.ledger.salonId,
        booksy_gmail_account_id: booksyGmailAccountId,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        subject: message.subject || null,
        from_address: message.from || null,
        internal_date: message.internalDate ?? null,
        ingest_source: 'polling_fallback',
      })
      .select('id')
      .maybeSingle()

    if (error) {
      logger.warn('Gmail: raw email ledger insert failed during polling fetch', {
        action: 'booksy_raw_email_insert_failed',
        salonId: this.ledger.salonId,
        booksyGmailAccountId,
        gmailMessageId: message.id,
        error: error.message,
      })
      return null
    }

    return data?.id ?? null
  }

  /**
   * Label message as processed
   */
  async markAsProcessed(messageId: string, success = true): Promise<void> {
    try {
      const labelName = success ? 'booksy/processed' : 'booksy/error'
      const labelId = await this.getOrCreateLabelId(labelName)

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      })
    } catch (error) {
      logger.error('Gmail: markAsProcessed failed', error, { messageId, success })
    }
  }

  /**
   * Resolve Gmail label id; handles create races/conflicts (409).
   */
  private async getOrCreateLabelId(labelName: string): Promise<string> {
    const findLabel = async () => {
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' })
      const labels = labelsResponse.data.labels || []
      return labels.find((l: any) => (l.name || '').toLowerCase() === labelName.toLowerCase()) || null
    }

    let label = await findLabel()
    if (label?.id) return label.id

    try {
      const createResponse = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      })
      if (createResponse.data?.id) return createResponse.data.id
    } catch (error: any) {
      const conflict =
        error?.code === 409 ||
        error?.status === 409 ||
        /exists or conflicts/i.test(error?.message || '')
      if (!conflict) {
        throw error
      }
    }

    label = await findLabel()
    if (label?.id) return label.id

    throw new Error(`Unable to resolve Gmail label id for ${labelName}`)
  }
}
