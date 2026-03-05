import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { normalizePolishPhoneToE164 } from '@/lib/messaging/sms-sender'
import { verifySmsWebhookSignature } from '@/lib/messaging/webhook-signature'

function normalizeInboundStatus(raw: string): 'received' | 'sent' | 'delivered' | 'failed' {
  const status = (raw || '').toLowerCase()
  if (status.includes('deliv')) return 'delivered'
  if (status.includes('fail') || status.includes('error') || status.includes('undeliver')) return 'failed'
  if (status.includes('sent') || status.includes('queue')) return 'sent'
  return 'received'
}

function pickField(payload: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export async function POST(request: NextRequest) {
  try {
    const valid = await verifySmsWebhookSignature(request.clone())
    if (!valid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let payload: Record<string, any> = {}
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      payload = await request.json().catch(() => ({}))
    } else {
      const raw = await request.text()
      const form = new URLSearchParams(raw)
      form.forEach((value, key) => {
        payload[key] = value
      })
    }

    const from = pickField(payload, ['from', 'sender', 'msisdn', 'phone'])
    const body = pickField(payload, ['text', 'body', 'message'])
    const providerMessageId = pickField(payload, ['id', 'messageId', 'message_id', 'sms_id'])
    const statusRaw = pickField(payload, ['status', 'status_name'])
    const status = normalizeInboundStatus(statusRaw)

    const admin = createAdminSupabaseClient()

    // Delivery reports update existing outbound row.
    if (providerMessageId && (status === 'sent' || status === 'delivered' || status === 'failed')) {
      await (admin as any)
        .from('sms_messages')
        .update({
          status,
          delivered_at: status === 'delivered' ? new Date().toISOString() : null,
          error_message: status === 'failed' ? pickField(payload, ['error', 'err']) : null,
        })
        .eq('provider_message_id', providerMessageId)
        .eq('direction', 'outbound')
    }

    // Inbound message insert for CRM chat.
    if (from && body) {
      let normalizedPhone = from
      try {
        normalizedPhone = normalizePolishPhoneToE164(from)
      } catch {
        normalizedPhone = from
      }

      const { data: matchingClients, error: clientLookupError } = await (admin as any)
        .from('clients')
        .select('id, salon_id')
        .eq('phone', normalizedPhone)
        .is('deleted_at', null)
        .limit(2)

      if (clientLookupError) {
        console.error('[SMS_WEBHOOK] client lookup error:', clientLookupError.message)
      }

      const clients = (matchingClients || []) as Array<{ id: string; salon_id: string }>

      if (clients.length > 1) {
        // Phone number exists in multiple salons — cannot reliably attribute inbound message.
        // Log and skip to avoid incorrect cross-tenant data attribution.
        console.warn('[SMS_WEBHOOK] ambiguous inbound: phone matches multiple clients', {
          phone: normalizedPhone,
          clientIds: clients.map((c) => c.id),
        })
      } else {
        const client = clients[0]
        if (client?.salon_id) {
          await (admin as any).from('sms_messages').insert({
            salon_id: client.salon_id,
            client_id: client.id,
            direction: 'inbound',
            body,
            status: 'received',
            provider_message_id: providerMessageId || null,
            created_at: new Date().toISOString(),
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
