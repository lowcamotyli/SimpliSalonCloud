import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createHmac, timingSafeEqual } from 'node:crypto'

const REPLAY_WINDOW_MS = 5 * 60 * 1000

function mapSmsApiStatus(raw: string): 'sent' | 'delivered' | 'failed' | null {
  const status = raw.toLowerCase()

  if (status.includes('deliv')) return 'delivered'
  if (status.includes('sent') || status.includes('queue')) return 'sent'
  if (status.includes('fail') || status.includes('error') || status.includes('undeliver')) return 'failed'

  return null
}

function isWebhookAuthorized(rawBody: string, request: NextRequest, secret: string): boolean {
  // SECURITY: signed header auth only.
  const timestampHeader = request.headers.get('x-smsapi-timestamp') || ''
  const signatureHeader = (request.headers.get('x-smsapi-signature') || '').replace(/^sha256=/i, '')

  if (!timestampHeader || !signatureHeader) {
    return false
  }

  const timestampMs = Number(timestampHeader)
  if (!Number.isFinite(timestampMs)) {
    return false
  }

  const timestampMillis = timestampMs < 1_000_000_000_000 ? timestampMs * 1000 : timestampMs
  if (Math.abs(Date.now() - timestampMillis) > REPLAY_WINDOW_MS) {
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    return false
  }

  return timingSafeEqual(a, b)
}

async function isReplay(request: NextRequest, supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<boolean> {
  const timestamp = request.headers.get('x-smsapi-timestamp') || ''
  const signature = request.headers.get('x-smsapi-signature') || ''
  const eventId = request.headers.get('x-smsapi-event-id') || `${timestamp}:${signature}`

  if (!eventId) return true

  const expiresAt = new Date(Date.now() + REPLAY_WINDOW_MS).toISOString()

  // Cleanup stale entries opportunistically
  await supabase.from('webhook_replay_cache').delete().lt('expires_at', new Date().toISOString())

  // Atomic insert — conflict means replay
  const { error } = await supabase
    .from('webhook_replay_cache')
    .insert({ event_id: eventId, expires_at: expiresAt })

  return !!error // conflict (23505) = duplicate = replay
}

type SmsApiWebhookDeps = {
  createSupabase: typeof createAdminSupabaseClient
  getWebhookToken: () => string | undefined
}

const defaultDeps: SmsApiWebhookDeps = {
  createSupabase: createAdminSupabaseClient,
  getWebhookToken: () => process.env.SMSAPI_WEBHOOK_TOKEN,
}

export async function handleSmsApiWebhook(request: NextRequest, deps: SmsApiWebhookDeps = defaultDeps) {
  try {
    const webhookSecret = deps.getWebhookToken()
    if (!webhookSecret) {
      return NextResponse.json({ error: 'SMSAPI_WEBHOOK_TOKEN is not configured' }, { status: 500 })
    }

    const isGet = request.method.toUpperCase() === 'GET'
    const rawBody = isGet ? '' : await request.text()

    if (!isWebhookAuthorized(rawBody, request, webhookSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = deps.createSupabase()

    if (await isReplay(request, supabase)) {
      return NextResponse.json({ error: 'Replay detected' }, { status: 409 })
    }

    const url = new URL(request.url)
    const formData = isGet ? null : new URLSearchParams(rawBody)

    const providerId = String(
      (formData?.get('id') || formData?.get('message_id') || formData?.get('msgid') ||
        url.searchParams.get('id') ||
        url.searchParams.get('message_id') ||
        url.searchParams.get('msgid') ||
        '')
    ).trim()
    const messageLogId = String(formData?.get('message_log_id') || url.searchParams.get('message_log_id') || '').trim()
    const salonId = String(formData?.get('salon_id') || url.searchParams.get('salon_id') || '').trim()
    const statusRaw = String(formData?.get('status') || formData?.get('status_name') || url.searchParams.get('status') || url.searchParams.get('status_name') || '').trim()
    const errorRaw = String(formData?.get('error') || formData?.get('err') || url.searchParams.get('error') || url.searchParams.get('err') || '').trim()

    const nextStatus = mapSmsApiStatus(statusRaw)
    if (!providerId || !nextStatus || !messageLogId || !salonId) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const updatePayload: Record<string, any> = {
      status: nextStatus,
      error: nextStatus === 'failed' ? errorRaw || statusRaw : null,
    }

    if (nextStatus === 'sent' || nextStatus === 'delivered') {
      updatePayload.sent_at = new Date().toISOString()
    }

    const { data, error } = await (supabase as any)
      .from('message_logs')
      .update(updatePayload)
      .eq('id', messageLogId)
      .eq('salon_id', salonId)
      .eq('provider_id', providerId)
      .eq('channel', 'sms')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!Array.isArray(data) || data.length !== 1) {
      return NextResponse.json({ ok: false, error: 'Ambiguous webhook update target' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 400 }
    )
  }
}

export async function POST(request: NextRequest) {
  return handleSmsApiWebhook(request)
}

// SECURITY: GET disabled — webhooks must use POST with header auth only.
// Accepting GET would expose the token in URL query params via server/proxy logs.
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
