import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'
import { sendSms } from '@/lib/messaging/sms-sender'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  salon_id: string
  client_id: string | null
  service_id: string | null
  client: {
    id: string
    full_name: string | null
    phone: string | null
  } | null
  service: {
    id: string
    name: string | null
  } | null
}

type MessageTemplateRow = {
  id: string
  name: string | null
  body: string | null
}

function fillTemplate(template: string, booking: BookingRow): string {
  return template
    .replaceAll('{{client_name}}', booking.client?.full_name ?? '')
    .replaceAll('{{service_name}}', booking.service?.name ?? '')
    .replaceAll('{{appointment_time}}', `${booking.booking_date} ${booking.booking_time}`)
}

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext,
) => {
  const { id: bookingId } = await params

  if (!bookingId) {
    throw new ValidationError('Booking id is required')
  }

  const body = await request.json()
  const templateId = typeof body?.template_id === 'string' ? body.template_id.trim() : ''

  if (!templateId) {
    throw new ValidationError('template_id is required')
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const role = user.app_metadata?.role
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can send booking SMS messages')
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_date,
      booking_time,
      salon_id,
      client_id,
      service_id,
      client:clients(id, full_name, phone),
      service:services(id, name)
    `)
    .eq('id', bookingId)
    .single()

  if (bookingError) {
    if (bookingError.code === 'PGRST116') {
      throw new NotFoundError('Booking', bookingId)
    }
    throw bookingError
  }

  const typedBooking = booking as BookingRow | null
  if (!typedBooking) {
    throw new NotFoundError('Booking', bookingId)
  }

  if (typedBooking.salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Booking', bookingId)
  }

  const { data: template, error: templateError } = await supabase
    .from('message_templates')
    .select('id, name, body')
    .eq('id', templateId)
    .eq('salon_id', typedBooking.salon_id)
    .maybeSingle()

  if (templateError) {
    throw templateError
  }

  const typedTemplate = template as MessageTemplateRow | null
  if (!typedTemplate) {
    throw new NotFoundError('Message template', templateId)
  }

  if (!typedBooking.client?.id || !typedBooking.client.phone) {
    throw new ValidationError('Booking client must have a phone number')
  }

  const smsBody = fillTemplate(typedTemplate.body ?? '', typedBooking)
  const result = await sendSms({
    salonId: typedBooking.salon_id,
    to: typedBooking.client.phone,
    body: smsBody,
    clientId: typedBooking.client.id,
  })

  return NextResponse.json({
    success: true,
    message_id: result.messageId,
  })
})
