import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { renderTemplate } from '@/lib/messaging/template-renderer'

type NotificationType = 'reminder' | 'survey' | 'confirmation' | 'cancellation'

type ReminderRuleRow = {
  id: string
  message_template: string | null
  hours_before: number | null
  require_confirmation: boolean | null
}

function isNotificationType(value: string | null): value is NotificationType {
  return value === 'reminder' || value === 'survey' || value === 'confirmation' || value === 'cancellation'
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const salonId = request.nextUrl.searchParams.get('salonId')
    const typeParam = request.nextUrl.searchParams.get('type')

    if (!salonId) {
      return NextResponse.json({ error: 'Brak wymaganego parametru salonId' }, { status: 400 })
    }

    if (!isNotificationType(typeParam)) {
      return NextResponse.json({ error: 'Nieznany typ powiadomienia' }, { status: 400 })
    }

    if (typeParam === 'reminder') {
      const admin = createAdminSupabaseClient()
      const { data: rule, error } = await admin
        .from('reminder_rules')
        .select('id, message_template, hours_before, require_confirmation')
        .eq('salon_id', salonId)
        .eq('is_active', true)
        .order('hours_before', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!rule) {
        return NextResponse.json({ error: 'Brak aktywnych reguł przypomnień' }, { status: 404 })
      }

      const renderedBody = renderTemplate(
        rule.message_template ?? '',
        {
          clientName: 'Anna Kowalska',
          time: '14:30',
          date: '12.03.2026',
          confirmUrl: 'https://example.com/potwierdz/XXXXX',
        },
        'sms-safe'
      )

      return NextResponse.json({
        type: 'reminder',
        channel: 'sms',
        body: renderedBody,
        template: rule.message_template,
        hoursBefore: rule.hours_before,
      })
    }

    if (typeParam === 'survey') {
      return NextResponse.json({
        type: 'survey',
        channel: 'sms',
        body: 'Dziękujemy za wizytę! Oceń nas w 30 sekund: https://example.com/ankieta/XXXXX',
        template: 'Dziękujemy za wizytę! Oceń nas w 30 sekund: {{url}}',
      })
    }

    if (typeParam === 'confirmation') {
      return NextResponse.json({
        type: 'confirmation',
        channel: 'email',
        body: 'Dziękujemy za rezerwację, Anna Kowalska! Twoja wizyta została potwierdzona na 12.03.2026 o 14:30.',
        template: null,
      })
    }

    return NextResponse.json({
      type: 'cancellation',
      channel: 'email',
      body: 'Wizyta Anny Kowalskiej zaplanowana na 12.03.2026 o 14:30 została anulowana.',
      template: null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate notification preview' },
      { status: 500 }
    )
  }
}
