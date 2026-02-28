import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

function mapResendEventToStatus(eventType: string): 'sent' | 'delivered' | 'failed' | 'bounced' | null {
  const type = eventType.toLowerCase()

  if (type.includes('delivered')) return 'delivered'
  if (type.includes('bounced') || type.includes('complained')) return 'bounced'
  if (type.includes('failed') || type.includes('error')) return 'failed'
  if (type.includes('sent')) return 'sent'

  return null
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET is not configured' }, { status: 500 })
    }

    const payload = await request.text()

    const headers = {
      'svix-id': request.headers.get('svix-id') || '',
      'svix-timestamp': request.headers.get('svix-timestamp') || '',
      'svix-signature': request.headers.get('svix-signature') || '',
    }

    const verifier = new Webhook(webhookSecret)
    const event = verifier.verify(payload, headers) as any

    const providerId = event?.data?.email_id || event?.data?.id || null
    const eventType = event?.type || ''
    const nextStatus = mapResendEventToStatus(eventType)

    if (!providerId || !nextStatus) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const supabase = createAdminSupabaseClient()
    const updatePayload: Record<string, any> = {
      status: nextStatus,
      error: nextStatus === 'failed' || nextStatus === 'bounced' ? eventType : null,
    }

    if (nextStatus === 'sent' || nextStatus === 'delivered') {
      updatePayload.sent_at = new Date().toISOString()
    }

    const { error } = await (supabase as any)
      .from('message_logs')
      .update(updatePayload)
      .eq('provider_id', providerId)
      .eq('channel', 'email')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 400 }
    )
  }
}

