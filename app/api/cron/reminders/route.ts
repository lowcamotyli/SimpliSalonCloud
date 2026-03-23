import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { hasFeature } from '@/lib/features'
import { renderTemplate } from '@/lib/messaging/template-renderer'
import { sendSms } from '@/lib/messaging/sms-sender'
import { generateBookingConfirmToken } from '@/lib/messaging/booking-confirm-token'
import { getAppUrl } from '@/lib/config/app-url'

type ReminderRule = {
  id: string
  salon_id: string
  hours_before: number
  message_template: string
  require_confirmation: boolean
  target_blacklisted_only: boolean
  salons?: {
    features?: Record<string, boolean>
  } | null
}

function toDateTime(bookingDate: string, bookingTime: string): Date {
  const safeTime = bookingTime.length === 5 ? `${bookingTime}:00` : bookingTime
  return new Date(`${bookingDate}T${safeTime}`)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pl-PL')
}

function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toIsoTimeString(date: Date): string {
  return date.toISOString().slice(11, 16) // HH:MM in UTC
}

export async function GET(request: NextRequest) {
  const authError = validateCronSecret(request)
  if (authError) return authError

  const admin = createAdminSupabaseClient()
  const now = new Date()
  const windowMs = 7.5 * 60 * 1000

  const result = {
    rulesScanned: 0,
    bookingsMatched: 0,
    remindersSent: 0,
    remindersFailed: 0,
  }

  try {
    const { data: rules, error: rulesError } = await (admin as any)
      .from('reminder_rules')
      .select('id, salon_id, hours_before, message_template, require_confirmation, target_blacklisted_only, salons!inner(features)')
      .eq('is_active', true)

    if (rulesError) {
      return NextResponse.json({ error: rulesError.message }, { status: 500 })
    }

    const typedRules: ReminderRule[] = rules || []
    result.rulesScanned = typedRules.length

    // Batch-fetch notification settings per salon
    const salonIds = [...new Set(typedRules.map(r => r.salon_id))]
    const { data: salonSettingsRows } = await (admin as any)
      .from('salon_settings')
      .select('salon_id, notification_settings')
      .in('salon_id', salonIds)
    const notifSettingsMap = new Map<string, any>(
      (salonSettingsRows || []).map((s: any) => [s.salon_id, s.notification_settings])
    )

    for (const rule of typedRules) {
      if (!hasFeature(rule.salons?.features || null, 'sms_chat')) {
        continue
      }

      const notifSettings = notifSettingsMap.get(rule.salon_id)
      if (!notifSettings?.clientReminders?.enabled) {
        continue
      }

      const targetAt = new Date(now.getTime() + rule.hours_before * 60 * 60 * 1000)
      const minDate = new Date(targetAt.getTime() - windowMs)
      const maxDate = new Date(targetAt.getTime() + windowMs)

      const minDateStr = toIsoDateString(minDate)
      const maxDateStr = toIsoDateString(maxDate)

      let candidatesQuery = (admin as any)
        .from('bookings')
        .select('id, salon_id, booking_date, booking_time, status, reminder_sent, client:clients(id, full_name, phone, blacklist_status)')
        .eq('salon_id', rule.salon_id)
        .eq('reminder_sent', false)
        .in('status', ['pending', 'confirmed', 'scheduled'])
        .gte('booking_date', minDateStr)
        .lte('booking_date', maxDateStr)

      // When the window stays within the same UTC day, also filter by time to reduce false positives.
      if (minDateStr === maxDateStr) {
        candidatesQuery = candidatesQuery
          .gte('booking_time', toIsoTimeString(minDate))
          .lte('booking_time', toIsoTimeString(maxDate))
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery

      if (candidatesError) {
        result.remindersFailed += 1
        continue
      }

      for (const booking of candidates || []) {
        const startsAt = toDateTime(booking.booking_date, booking.booking_time)
        if (startsAt.getTime() < minDate.getTime() || startsAt.getTime() > maxDate.getTime()) {
          continue
        }

        const client = booking.client
        if (!client?.phone) continue
        // When rule targets blacklisted clients only, skip non-blacklisted
        if (rule.target_blacklisted_only && client.blacklist_status !== 'active') continue
        result.bookingsMatched += 1

        let confirmUrl = ''
        if (rule.require_confirmation) {
          const token = await generateBookingConfirmToken({
            bookingId: booking.id,
            salonId: booking.salon_id,
          })
          const appUrl = getAppUrl()
          confirmUrl = `${appUrl}/api/bookings/confirm/${token}?action=confirm`
        }

        try {
          const body = renderTemplate(
            rule.message_template,
            {
              clientName: client.full_name || 'Kliencie',
              time: formatTime(startsAt),
              date: formatDate(startsAt),
              confirmUrl,
            },
            'sms-safe'
          )

          await sendSms({
            salonId: booking.salon_id,
            clientId: client.id,
            to: client.phone,
            body,
          })

          await (admin as any)
            .from('bookings')
            .update({ reminder_sent: true, updated_at: new Date().toISOString() })
            .eq('id', booking.id)
            .eq('salon_id', booking.salon_id)

          result.remindersSent += 1
        } catch {
          result.remindersFailed += 1
        }
      }
    }

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reminder cron failed', result },
      { status: 500 }
    )
  }
}
