import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { hasFeature } from '@/lib/features'
import { generateFormToken } from '@/lib/forms/token'
import { sendSms } from '@/lib/messaging/sms-sender'

type BookingCandidate = {
  id: string
  salon_id: string
  client_id: string
  booking_date: string
  booking_time: string
  salons?: { features?: Record<string, boolean> } | null
  clients?: { id: string; phone: string | null; full_name: string | null } | null
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toDateTime(bookingDate: string, bookingTime: string): Date {
  const safeTime = bookingTime.length === 5 ? bookingTime + ':00' : bookingTime
  return new Date(bookingDate + 'T' + safeTime)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = validateCronSecret(request)
  if (authError) return authError

  const admin = createAdminSupabaseClient()
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let sent = 0
  let skipped = 0

  try {
    const now = new Date()
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)
    const windowStartDate = toIsoDateString(windowStart)
    const windowEndDate = toIsoDateString(windowEnd)

    const { data, error } = await admin
      .from('bookings')
      .select('id, salon_id, client_id, booking_date, booking_time, salons(features), clients(id, phone, full_name)')
      .in('status', ['confirmed', 'pending'])
      .eq('pre_form_sent', false)
      .gte('booking_date', windowStartDate)
      .lte('booking_date', windowEndDate)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bookings = (data || []) as BookingCandidate[]

    const filtered = bookings.filter((b) => {
      const dt = toDateTime(b.booking_date, b.booking_time)
      return !isNaN(dt.getTime()) && dt >= windowStart && dt <= windowEnd
    })

    const uniqueSalonIds = [...new Set(filtered.map((b) => b.salon_id))]
    const { data: salonSettingsRows } = await admin
      .from('salon_settings')
      .select('salon_id, notification_settings')
      .in('salon_id', uniqueSalonIds)

    const notifSettingsMap = new Map(
      (salonSettingsRows || []).map((s: any) => [s.salon_id, s.notification_settings])
    )

    for (const booking of filtered) {
      try {
        if (!hasFeature(booking.salons?.features || null, 'forms')) {
          skipped++
          continue
        }

        const settings: any = notifSettingsMap.get(booking.salon_id)
        if (!settings?.preAppointmentForms?.enabled) {
          skipped++
          continue
        }

        if (!booking.clients?.phone) {
          skipped++
          continue
        }

        const token = await generateFormToken(
          {
            formTemplateId: 'pre_appointment',
            clientId: booking.client_id,
            bookingId: booking.id,
            salonId: booking.salon_id,
          },
          '48h'
        )

        const fillTokenExp = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

        const { error: insertError } = await admin.from('pre_appointment_responses').insert({
          booking_id: booking.id,
          client_id: booking.client_id,
          salon_id: booking.salon_id,
          form_template_id: 'pre_appointment',
          fill_token: token,
          fill_token_exp: fillTokenExp,
          sent_at: new Date().toISOString(),
        })

        if (insertError) {
          skipped++
          continue
        }

        await sendSms({
          salonId: booking.salon_id,
          clientId: booking.clients.id,
          to: booking.clients.phone,
          body: `Przypomnienie o wizycie jutro. Wypełnij krótki formularz przed wizytą: ${appUrl}/forms/pre/${token}`,
        })

        await admin
          .from('bookings')
          .update({ pre_form_sent: true, updated_at: new Date().toISOString() })
          .eq('id', booking.id)
          .eq('salon_id', booking.salon_id)

        sent++
      } catch (e) {
        skipped++
        continue
      }
    }

    return NextResponse.json({ ok: true, sent, skipped })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
