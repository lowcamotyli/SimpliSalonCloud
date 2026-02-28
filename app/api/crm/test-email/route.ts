import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'
import { sendEmailMessage } from '@/lib/messaging/email-sender'

const testEmailSchema = z.object({
  salonId: z.string().uuid(),
  to: z.string().email(),
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

    const body = await request.json()
    const { salonId, to } = testEmailSchema.parse(body)

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .eq('salon_id', salonId)
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

    const rateLimit = await checkProtectedApiRateLimit(`crm:test-email:${user.id}:${salonId}`)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many test email requests. Please try again later.' },
        { status: 429 }
      )
    }

    const feature = await checkFeatureAccess(salonId, 'email_notifications')
    if (!feature.allowed) {
      return NextResponse.json(
        { error: feature.reason || 'Email notifications are not available' },
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

    const subject = 'Test wiadomości email (CRM)'
    const html = '<p>To jest testowa wiadomość email z integracji CRM.</p>'
    const text = 'To jest testowa wiadomość email z integracji CRM.'

    const { data: log, error: logError } = await (admin as any)
      .from('message_logs')
      .insert({
        salon_id: salonId,
        client_id: client.id,
        channel: 'email',
        recipient: to,
        subject,
        body: text,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logError || !log?.id) {
      return NextResponse.json({ error: logError?.message || 'Failed to create message log' }, { status: 500 })
    }

    const result = await sendEmailMessage({
      salonId,
      messageLogId: log.id,
      to,
      subject,
      html,
      text,
    })

    return NextResponse.json({ ok: true, messageLogId: log.id, providerId: result.providerId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test email' },
      { status: 500 }
    )
  }
}

