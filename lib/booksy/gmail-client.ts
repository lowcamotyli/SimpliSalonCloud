import { google } from 'googleapis'

interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  body: string
  date: string
}

export class GmailClient {
  private gmail: any
  private oauth2Client: any

  constructor(credentials: { access_token?: string; refresh_token?: string }) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    this.oauth2Client.setCredentials(credentials)
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
  }

  /**
   * Static helper to get OAuth URL
   */
  static getAuthUrl(state?: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.labels',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
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
      process.env.GOOGLE_REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)
    return tokens
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
      console.error('Error getting user email:', error)
      return null
    }
  }

  /**
   * Search for Booksy emails
   */
  async searchBooksyEmails(maxResults = 20, senderFilter = '@booksy.com'): Promise<GmailMessage[]> {
    try {
      const sender = senderFilter.trim() || '@booksy.com'
      const query = [
        `from:${sender}`,
        'subject:"nowa rezerwacja"',
        '-label:booksy/processed',
        '-label:booksy/error',
      ].join(' ')
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      })

      const messages = response.data.messages || []
      const fullMessages: GmailMessage[] = []

      for (const message of messages) {
        const fullMessage = await this.getFullMessage(message.id)
        if (fullMessage) {
          fullMessages.push(fullMessage)
        }
      }

      return fullMessages
    } catch (error) {
      if (GmailClient.isInvalidGrantError(error)) {
        const authError = new Error('Gmail authorization expired. Reconnect Gmail account.')
        ;(authError as any).code = 'GMAIL_REAUTH_REQUIRED'
        ;(authError as any).cause = error
        throw authError
      }
      console.error('Error searching Booksy emails:', error)
      throw error
    }
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
      }
    } catch (error) {
      console.error('Error getting message details:', error)
      return null
    }
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
      console.error('Error labeling message:', error)
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
