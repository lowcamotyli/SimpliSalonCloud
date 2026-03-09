import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { hasFeature } from '@/lib/features'
import { generateSurveyToken } from '@/lib/messaging/survey-token'
import { sendSms } from '@/lib/messaging/sms-sender'

type BookingCandidate = {
  id: string
  salon_id: string
  client_id: string
  booking_date: string
  booking_time: string
  duration: number
  survey_sent: boolean
  salons?: {
    features?: Record<string, boolean>
  } | null
  clients?: {
    id: string
    phone: string | null
    full_name: string | null
  } | null
  services?: {
    id: string
    survey_enabled: boolean
    survey_custom_message: string | null
  } | null
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toDateTime(bookingDate: string, bookingTime: string): Date {
  const safeTime = bookingTime.length === 5 ? `${bookingTime}:00` : bookingTime
  return new Date(`${bookingDate}T${safeTime}`)
}

export async function GET(request: NextRequest) {
  const authError = validateCronSecret(request)
  if (authError) return authError

  const admin = createAdminSupabaseClient()
  const now = new Date()
  const nowMs = now.getTime()
  const minEndMs = nowMs - 2.5 * 60 * 60 * 1000
  const maxEndMs = nowMs - 2 * 60 * 60 * 1000
  const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000)
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  let sent = 0
  let skipped = 0

  try {
    const { data, error } = await admin
      .from('bookings')
      .select(
        'id, salon_id, client_id, booking_date, booking_time, duration, survey_sent, salons(features), clients(id, phone, full_name), services(id, survey_enabled, survey_custom_message)'
      )
      .eq('status', 'completed')
      .eq('survey_sent', false)
      .gte('booking_date', toIsoDateString(yesterday))
      .lte('booking_date', toIsoDateString(now))

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bookings = (data || []) as BookingCandidate[]

    for (const booking of bookings) {
      const endsAtMs = toDateTime(booking.booking_date, booking.booking_time).getTime() + booking.duration * 60_000

      if (Number.isNaN(endsAtMs) || endsAtMs < minEndMs || endsAtMs > maxEndMs) {
        skipped += 1
        continue
      }

      if (!hasFeature(booking.salons?.features || null, 'surveys')) {
        skipped += 1
        continue
      }

      // Skip if the specific service has surveys disabled
      if (booking.services?.survey_enabled === false) {
        skipped += 1
        continue
      }

      const client = booking.clients
      if (!client?.phone) {
        skipped += 1
        continue
      }

      try {
        const token = await generateSurveyToken({
          bookingId: booking.id,
          salonId: booking.salon_id,
        })

        const fillTokenExp = new Date(nowMs + 48 * 60 * 60 * 1000).toISOString()

        // 1. Insert survey row first — UNIQUE(booking_id) protects against duplicates on retry
        const { error: insertError } = await admin.from('satisfaction_surveys').insert({
          booking_id: booking.id,
          client_id: booking.client_id,
          salon_id: booking.salon_id,
          service_id: booking.services?.id ?? null,
          fill_token: token,
          fill_token_exp: fillTokenExp,
        })

        if (insertError) {
          skipped += 1
          continue
        }

        // 2. Send SMS — if this fails, survey row exists and next cron run will be blocked
        //    by the UNIQUE constraint (no duplicate sent), but survey row is orphaned.
        //    Acceptable tradeoff vs sending duplicate SMS.
        const surveyUrl = `${appUrl}/survey/${token}`
        const smsBody = booking.services?.survey_custom_message
          ? booking.services.survey_custom_message.replace('{{url}}', surveyUrl)
          : `Dzi\u0119kujemy za wizyt\u0119! Oce\u0144 nas w 30 sekund: ${surveyUrl}`

        await sendSms({
          salonId: booking.salon_id,
          clientId: client.id,
          to: client.phone,
          body: smsBody,
        })

        // 3. Mark booking as sent — if this fails, UNIQUE on survey row prevents duplicate
        //    insert on retry, so SMS won't be sent twice.
        await admin
          .from('bookings')
          .update({ survey_sent: true, updated_at: new Date().toISOString() })
          .eq('id', booking.id)
          .eq('salon_id', booking.salon_id)

        sent += 1
      } catch {
        skipped += 1
      }
    }

    return NextResponse.json({ ok: true, sent, skipped })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Survey cron failed',
      },
      { status: 500 }
    )
  }
}
