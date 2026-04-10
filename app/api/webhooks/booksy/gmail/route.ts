import { NextRequest, NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

const pushEnvelopeSchema = z.object({
  message: z.object({
    messageId: z.string().min(1),
    data: z.string().min(1),
    publishTime: z.string().optional(),
  }),
  subscription: z.string().optional(),
})

const gmailNotificationSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]),
})

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization')

  if (!authorization) {
    return null
  }

  const [scheme, token] = authorization.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null
  }

  return token
}

async function verifyGoogleOidcToken(request: NextRequest): Promise<void> {
  const audience = process.env.GOOGLE_BOOKSY_PUBSUB_AUDIENCE?.trim()

  if (!audience) {
    throw new Error('GOOGLE_BOOKSY_PUBSUB_AUDIENCE is required')
  }

  const token = getBearerToken(request)
  if (!token) {
    throw new Error('Missing Google OIDC bearer token')
  }

  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    audience,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  })

  if (payload.email_verified === false) {
    throw new Error('Google OIDC token email is not verified')
  }
}

function decodePubSubData(encoded: string): z.infer<typeof gmailNotificationSchema> {
  let decoded = ''

  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    throw new Error('Invalid Pub/Sub message.data base64 payload')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(decoded)
  } catch {
    throw new Error('Invalid Gmail Pub/Sub notification JSON payload')
  }

  const notification = gmailNotificationSchema.parse(parsed)
  return notification
}

function parseHistoryId(historyId: string | number): number {
  const parsed = typeof historyId === 'number' ? historyId : Number(historyId)

  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid Gmail historyId in Pub/Sub payload')
  }

  return parsed
}

export async function POST(request: NextRequest) {
  try {
    await verifyGoogleOidcToken(request)

    const rawBody = await request.json()
    const envelope = pushEnvelopeSchema.parse(rawBody)
    const notification = decodePubSubData(envelope.message.data)
    const historyId = parseHistoryId(notification.historyId)
    const supabase = createAdminClient()

    const { data: account, error: accountError } = await supabase
      .from('booksy_gmail_accounts')
      .select('id, salon_id')
      .eq('gmail_email', notification.emailAddress)
      .eq('is_active', true)
      .maybeSingle()

    if (accountError) {
      throw new Error(`Failed to resolve Booksy Gmail account: ${accountError.message}`)
    }

    if (!account) {
      throw new Error(`No active Booksy Gmail account found for ${notification.emailAddress}`)
    }

    const { error: notificationError } = await supabase
      .from('booksy_gmail_notifications')
      .upsert({
        salon_id: account.salon_id,
        booksy_gmail_account_id: account.id,
        pubsub_message_id: envelope.message.messageId,
        email_address: notification.emailAddress,
        history_id: historyId,
        processing_status: 'pending',
      }, { onConflict: 'pubsub_message_id', ignoreDuplicates: true })

    if (notificationError) {
      throw new Error(`Failed to persist Booksy Gmail notification: ${notificationError.message}`)
    }

    const { error: watchError } = await supabase
      .from('booksy_gmail_watches')
      .update({
        last_notification_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('booksy_gmail_account_id', account.id)
      .eq('salon_id', account.salon_id)

    if (watchError) {
      throw new Error(`Failed to update Booksy Gmail watch heartbeat: ${watchError.message}`)
    }

    return NextResponse.json({ accepted: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Gmail Pub/Sub request'
    const status =
      error instanceof z.ZodError
        ? 400
        : /oidc bearer token|email is not verified/i.test(message)
          ? 401
          : 500

    console.error('Booksy Gmail webhook error:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
