import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/messaging/email-sender'
import { decryptSecret, encryptSecret } from '@/lib/messaging/crypto'

export interface SendEmailOptions {
  salonId: string
  to: string
  subject: string
  html: string
  text?: string
  fromEmail?: string
  fromName?: string
}

interface GmailTokenRefreshResponse {
  access_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

function buildFromHeader(fromEmail: string, fromName?: string): string {
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail
}

function buildRawRfc2822Message(options: {
  from: string
  to: string
  subject: string
  html: string
}): string {
  const message = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    options.html,
  ].join('\r\n')

  return Buffer.from(message, 'utf8').toString('base64url')
}

async function refreshGmailAccessToken(refreshToken: string): Promise<{ accessToken: string; tokenExpiry: string }> {
  const clientId = process.env.GMAIL_SEND_CLIENT_ID
  const clientSecret = process.env.GMAIL_SEND_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_SEND_CLIENT_ID and GMAIL_SEND_CLIENT_SECRET are required')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const payload = (await response.json()) as GmailTokenRefreshResponse

  if (!response.ok || !payload.access_token) {
    const errorMessage = payload.error_description || payload.error || 'Unknown token refresh error'
    throw new Error(`Failed to refresh Gmail access token: ${errorMessage}`)
  }

  const expiresInSeconds = typeof payload.expires_in === 'number' ? payload.expires_in : 3600
  const tokenExpiry = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

  return {
    accessToken: payload.access_token,
    tokenExpiry,
  }
}

async function sendViaGmail(options: SendEmailOptions): Promise<void> {
  const supabase = createAdminSupabaseClient()

  const { data: credentials, error: credentialsError } = await (supabase as any)
    .from('gmail_send_credentials')
    .select('email, access_token_enc, refresh_token_enc, token_expiry')
    .eq('salon_id', options.salonId)
    .maybeSingle()

  if (credentialsError) {
    throw new Error(`Failed to fetch Gmail credentials: ${credentialsError.message}`)
  }

  if (!credentials) {
    throw new Error('Gmail credentials are not configured for this salon')
  }

  let accessToken = decryptSecret(credentials.access_token_enc)
  const refreshToken = decryptSecret(credentials.refresh_token_enc)

  const isExpired =
    !credentials.token_expiry ||
    Number.isNaN(new Date(credentials.token_expiry).getTime()) ||
    new Date(credentials.token_expiry).getTime() <= Date.now()

  if (isExpired) {
    const refreshed = await refreshGmailAccessToken(refreshToken)
    accessToken = refreshed.accessToken

    const { error: updateError } = await (supabase as any)
      .from('gmail_send_credentials')
      .update({
        access_token_enc: encryptSecret(refreshed.accessToken),
        token_expiry: refreshed.tokenExpiry,
      })
      .eq('salon_id', options.salonId)

    if (updateError) {
      throw new Error(`Failed to persist refreshed Gmail token: ${updateError.message}`)
    }
  }

  const fromEmail = options.fromEmail || credentials.email
  if (!fromEmail) {
    throw new Error('From email is required to send via Gmail')
  }

  const raw = buildRawRfc2822Message({
    from: buildFromHeader(fromEmail, options.fromName),
    to: options.to,
    subject: options.subject,
    html: options.html,
  })

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gmail send failed (${response.status}): ${errorText}`)
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const supabase = createAdminSupabaseClient()

  const { data: salon, error: salonError } = await (supabase as any)
    .from('salons')
    .select('email_provider')
    .eq('id', options.salonId)
    .maybeSingle()

  if (salonError) {
    throw new Error(`Failed to fetch salon email provider: ${salonError.message}`)
  }

  if (salon?.email_provider === 'gmail') {
    try {
      await sendViaGmail(options)
      return
    } catch (error) {
      console.error('Gmail email send failed, falling back to Resend', error)
    }
  }

  await sendTransactionalEmail({
    salonId: options.salonId,
    to: options.to,
    subject: options.subject,
    html: options.html,
  })
}
