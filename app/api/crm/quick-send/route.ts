import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'
import { sendEmailMessage } from '@/lib/messaging/email-sender'
import { sendSmsMessage } from '@/lib/messaging/sms-sender'

const quickSendSchema = z.object({
  salonId: z.string().uuid(),
  clientId: z.string().uuid(),
  channel: z.enum(['email', 'sms']),
  templateId: z.string().uuid().optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().max(8000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = quickSendSchema.parse(await request.json())

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (membership.role !== 'owner' && membership.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rateLimit = await checkProtectedApiRateLimit(`crm:quick-send:${user.id}:${payload.salonId}`)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many quick send requests. Please try again later.' },
        { status: 429 }
      )
    }

    if (payload.channel === 'email') {
      const emailFeature = await checkFeatureAccess(payload.salonId, 'email_notifications')
      if (!emailFeature.allowed) {
        return NextResponse.json(
          { error: emailFeature.reason || 'Email feature is not available', upgradeUrl: emailFeature.upgradeUrl },
          { status: 403 }
        )
      }
    }

    if (payload.channel === 'sms') {
      const smsFeature = await checkFeatureAccess(payload.salonId, 'sms_notifications')
      if (!smsFeature.allowed) {
        return NextResponse.json(
          { error: smsFeature.reason || 'SMS feature is not available', upgradeUrl: smsFeature.upgradeUrl },
          { status: 403 }
        )
      }
    }

    const { data: client, error: clientError } = await (supabase as any)
      .from('clients')
      .select('id, salon_id, full_name, email, phone, email_opt_in, sms_opt_in')
      .eq('id', payload.clientId)
      .eq('salon_id', payload.salonId)
      .is('deleted_at', null)
      .maybeSingle()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    let template: any = null
    if (payload.templateId) {
      const { data: templateData, error: templateError } = await (supabase as any)
        .from('message_templates')
        .select('id, salon_id, channel, subject, body')
        .eq('id', payload.templateId)
        .eq('salon_id', payload.salonId)
        .maybeSingle()

      if (templateError) {
        return NextResponse.json({ error: templateError.message }, { status: 500 })
      }

      if (!templateData) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      if (templateData.channel !== 'both' && templateData.channel !== payload.channel) {
        return NextResponse.json({ error: 'Template channel mismatch' }, { status: 400 })
      }

      template = templateData
    }

    const finalSubject = payload.channel === 'email' ? (payload.subject?.trim() || template?.subject || null) : null
    const finalBody = payload.body?.trim() || template?.body || ''

    if (!finalBody) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    if (payload.channel === 'email' && !finalSubject) {
      return NextResponse.json({ error: 'Subject is required for email messages' }, { status: 400 })
    }

    const recipient = payload.channel === 'email' ? client.email : client.phone
    if (!recipient) {
      return NextResponse.json({ error: 'Client has no recipient contact for selected channel' }, { status: 400 })
    }

    if (payload.channel === 'email' && client.email_opt_in === false) {
      return NextResponse.json({ error: 'Client has email opt-out enabled' }, { status: 400 })
    }

    if (payload.channel === 'sms' && client.sms_opt_in === false) {
      return NextResponse.json({ error: 'Client has SMS opt-out enabled' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    const { data: log, error: logError } = await (admin as any)
      .from('message_logs')
      .insert({
        salon_id: payload.salonId,
        client_id: client.id,
        channel: payload.channel,
        recipient,
        subject: finalSubject,
        body: finalBody,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logError || !log?.id) {
      return NextResponse.json({ error: logError?.message || 'Failed to create message log' }, { status: 500 })
    }

    if (payload.channel === 'email') {
      const result = await sendEmailMessage({
        salonId: payload.salonId,
        messageLogId: log.id,
        to: recipient,
        subject: finalSubject as string,
        text: finalBody,
        html: finalBody,
      })

      return NextResponse.json({ ok: true, channel: 'email', messageLogId: log.id, providerId: result.providerId })
    }

    const result = await sendSmsMessage({
      salonId: payload.salonId,
      messageLogId: log.id,
      to: recipient,
      body: finalBody,
    })

    return NextResponse.json({ ok: true, channel: 'sms', messageLogId: log.id, providerId: result.providerId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send quick message' },
      { status: 500 }
    )
  }
}

