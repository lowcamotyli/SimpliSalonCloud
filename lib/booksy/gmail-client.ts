/**
 * Gmail API Client for Booksy emails
 * Requires OAuth2 setup in GCP
 */

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

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    
    this.gmail = google.gmail({ version: 'v1', auth })
  }

  /**
   * Search for Booksy emails
   */
  async searchBooksyEmails(maxResults = 20): Promise<GmailMessage[]> {
    try {
      // Search query for Booksy emails
      const query = [
        'from:@booksy.com',
        'OR subject:"nowa rezerwacja"',
        'OR subject:"zmienił rezerwację"',
        'OR subject:"odwołał wizytę"',
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

      // Fetch full message details
      for (const message of messages) {
        const fullMessage = await this.getFullMessage(message.id)
        if (fullMessage) {
          fullMessages.push(fullMessage)
        }
      }

      return fullMessages
    } catch (error) {
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
      const headers = message.payload.headers

      const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
      const from = headers.find((h: any) => h.name === 'From')?.value || ''
      const date = headers.find((h: any) => h.name === 'Date')?.value || ''

      // Extract body (plain text or HTML)
      let body = ''
      
      if (message.payload.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
      } else if (message.payload.parts) {
        const textPart = message.payload.parts.find((p: any) => 
          p.mimeType === 'text/plain' || p.mimeType === 'text/html'
        )
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
        }
      }

      return {
        id: messageId,
        threadId: message.threadId,
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
      
      // Get or create label
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' })
      let label = labelsResponse.data.labels.find((l: any) => l.name === labelName)
      
      if (!label) {
        const createResponse = await this.gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        })
        label = createResponse.data
      }

      // Add label to message
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [label.id],
        },
      })
    } catch (error) {
      console.error('Error labeling message:', error)
    }
  }
}