import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'
import { sendSmsMessage } from '@/lib/messaging/sms-sender'
import { testSmsSettingsSchema } from '@/lib/validators/settings.validators'

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

    const body = await request.json()
    const { salonId, to } = testSmsSettingsSchema.parse(body)

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rateLimit = await checkProtectedApiRateLimit(`settings:sms:test:${user.id}:${salonId}`)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many test SMS requests. Please try again later.' },
        { status: 429 }
      )
    }

    const smsFeature = await checkFeatureAccess(salonId, 'sms_notifications')
    const crmSmsFeature = await checkFeatureAccess(salonId, 'crm_sms')
    if (!smsFeature.allowed && !crmSmsFeature.allowed) {
      return NextResponse.json(
        { error: smsFeature.reason || crmSmsFeature.reason || 'SMS feature is not available' },
        { status: 403 }
      )
    }

    const admin = createAdminSupabaseClient()

    const { data: client } = await (admin as any)
      .from('clients')
      .select('id')
      .eq('salon_id', salonId)
      .limit(1)
      .maybeSingle()

    if (!client?.id) {
      return NextResponse.json(
        { error: 'No client record available for this salon to attach test log' },
        { status: 400 }
      )
    }

    const bodyText = 'To jest testowa wiadomość SMS z ustawień SMSAPI.'

    const { data: log, error: logError } = await (admin as any)
      .from('message_logs')
      .insert({
        salon_id: salonId,
        client_id: client.id,
        channel: 'sms',
        recipient: to,
        body: bodyText,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logError || !log?.id) {
      return NextResponse.json({ error: logError?.message || 'Failed to create message log' }, { status: 500 })
    }

    const result = await sendSmsMessage({
      salonId,
      messageLogId: log.id,
      to,
      body: bodyText,
    })

    return NextResponse.json({ ok: true, messageLogId: log.id, providerId: result.providerId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test SMS' },
      { status: 500 }
    )
  }
}

