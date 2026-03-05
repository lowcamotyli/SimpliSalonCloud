import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/messaging/sms-sender'

const sendSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
  to: z.string().trim().optional(),
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

    const payload = sendSchema.parse(await request.json())

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const salonId = profile?.salon_id
    if (!salonId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: client, error: clientError } = await (supabase as any)
      .from('clients')
      .select('id, phone')
      .eq('id', payload.clientId)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const to = payload.to?.trim() || client.phone
    if (!to) {
      return NextResponse.json({ error: 'Client phone is missing' }, { status: 400 })
    }

    const result = await sendSms({
      salonId,
      clientId: payload.clientId,
      to,
      body: payload.body,
    })

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      status: result.status,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Failed to send SMS'
    const status = message === 'INSUFFICIENT_SMS_BALANCE' ? 402 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
