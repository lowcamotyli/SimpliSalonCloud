import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateBookingSchema } from '@/lib/validators/booking.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'
import type { Database } from '@/types/supabase'
import { BUSINESS_HOURS } from '@/lib/constants'
import { checkEquipmentAvailability, getRequiredEquipmentForService } from '@/lib/equipment/availability'

type BookingUpdate = Database['public']['Tables']['bookings']['Update']

// GET /api/bookings/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      *,
      employee:employees(id, employee_code, first_name, last_name),
      client:clients(id, client_code, full_name, phone),
      service:services(id, name, price, duration)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', id)
    throw error
  }

  if (!booking) {
    throw new NotFoundError('Booking', id)
  }

  if ((booking as any).salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Booking', id)
  }

  return NextResponse.json({ booking })
})

// PATCH /api/bookings/[id] - Update booking (status, payment, surcharge)
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const normalizedBody = {
    ...body,
    employee_id: body.employee_id || body.employeeId,
    date: body.date || body.bookingDate,
    start_time: body.start_time || body.bookingTime,
  }
  const validatedData = updateBookingSchema.parse(normalizedBody)

  // Get current version
  const { data: existingBooking, error: existingError } = await supabase
    .from('bookings')
    .select('id, version, employee_id, booking_date, booking_time, duration, salon_id, status, client_id')
    .eq('id', id)
    .single()

  if (existingError || !existingBooking) {
    throw new NotFoundError('Booking', id)
  }

  const currentBooking = existingBooking as {
    id: string
    version: number
    employee_id: string
    booking_date: string
    booking_time: string
    duration: number
    salon_id: string
    status: string
    client_id: string | null
  }

  if (currentBooking.salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Booking', id)
  }

  const targetEmployeeId = (validatedData.employee_id as string | undefined) ?? currentBooking.employee_id
  const targetDate = validatedData.date ?? currentBooking.booking_date
  const targetStartTime = validatedData.start_time ?? currentBooking.booking_time
  const targetDuration = Number(validatedData.duration ?? currentBooking.duration)

  // Only run scheduling validation when scheduling fields actually change
  const schedulingChanged =
    validatedData.date !== undefined ||
    validatedData.start_time !== undefined ||
    validatedData.duration !== undefined ||
    validatedData.employee_id !== undefined

  if (schedulingChanged) {

  if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new ValidationError('Długość wizyty musi być większa od 0')
  }

  const [startHour, startMinute] = String(targetStartTime).split(':').map(Number)
  const startTotalMinutes = startHour * 60 + (startMinute || 0)
  const endTotalMinutes = startTotalMinutes + targetDuration
  const businessStartMinutes = BUSINESS_HOURS.START * 60
  const businessEndMinutes = BUSINESS_HOURS.END * 60

  if (startTotalMinutes < businessStartMinutes || endTotalMinutes > businessEndMinutes) {
    throw new ValidationError('Termin wykracza poza godziny pracy')
  }

  const { data: sameDayBookings, error: sameDayBookingsError } = await supabase
    .from('bookings')
    .select('id, booking_time, duration, status')
    .eq('employee_id', targetEmployeeId)
    .eq('booking_date', targetDate)
    .is('deleted_at', null)
    .neq('id', id)

  if (sameDayBookingsError) {
    throw sameDayBookingsError
  }

  const hasConflict = (sameDayBookings || []).some((booking: any) => {
    if (booking.status === 'cancelled') return false
    const [otherHour, otherMinute] = String(booking.booking_time).split(':').map(Number)
    const otherStart = otherHour * 60 + (otherMinute || 0)
    const otherEnd = otherStart + Number(booking.duration || 0)
    return startTotalMinutes < otherEnd && endTotalMinutes > otherStart
  })

  if (hasConflict) {
    throw new ConflictError('Wybrany termin koliduje z inną wizytą')
  }

  }

  // Re-validate equipment availability when time changes
  const timeChanged = validatedData.date !== undefined || validatedData.start_time !== undefined || validatedData.duration !== undefined
  if (timeChanged) {
    const startsAt = new Date(`${targetDate}T${targetStartTime}`)
    const endsAt = new Date(startsAt.getTime() + targetDuration * 60_000)
    const requiredEquipment = await getRequiredEquipmentForService(
      (await (supabase as any).from('bookings').select('service_id').eq('id', id).single()).data?.service_id
    )
    if (requiredEquipment.length > 0) {
      const availability = await checkEquipmentAvailability(requiredEquipment, startsAt, endsAt, id)
      const conflicts = availability.filter((a: any) => !a.is_available)
      if (conflicts.length > 0) {
        return NextResponse.json({
          error: 'EQUIPMENT_CONFLICT',
          message: 'Wybrany termin jest niedostepny – sprzet jest juz zajety.',
          conflictingEquipment: conflicts.map((c: any) => c.equipment_id),
        }, { status: 409 })
      }
      // Update equipment_bookings times
      await (supabase as any)
        .from('equipment_bookings')
        .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
        .eq('booking_id', id)
    }
  }

  const updateData: BookingUpdate = {
    version: currentBooking.version, // Required by check_version() trigger
    updated_by: user.id,
  }

  if (validatedData.status) updateData.status = validatedData.status
  if (validatedData.paymentMethod) updateData.payment_method = validatedData.paymentMethod
  if (validatedData.surcharge !== undefined) updateData.surcharge = validatedData.surcharge
  if (validatedData.notes !== undefined) updateData.notes = validatedData.notes
  if (validatedData.duration !== undefined) updateData.duration = validatedData.duration
  if (validatedData.employee_id) updateData.employee_id = validatedData.employee_id
  if (validatedData.date) updateData.booking_date = validatedData.date
  if (validatedData.start_time) updateData.booking_time = validatedData.start_time

  const shouldRegisterNoShow =
    validatedData.status === 'no_show' &&
    currentBooking.status !== 'no_show' &&
    !!currentBooking.client_id

  // Late cancel: cancellation made within 24h before the appointment
  const LATE_CANCEL_HOURS = 24
  const bookingStartsAt = new Date(`${currentBooking.booking_date}T${currentBooking.booking_time}`)
  const hoursUntilBooking = (bookingStartsAt.getTime() - Date.now()) / (1000 * 60 * 60)
  const shouldRegisterLateCancel =
    validatedData.status === 'cancelled' &&
    !['cancelled', 'no_show', 'completed'].includes(currentBooking.status) &&
    !!currentBooking.client_id &&
    hoursUntilBooking >= 0 &&
    hoursUntilBooking <= LATE_CANCEL_HOURS

  const { data: booking, error } = await (supabase as any)
    .from('bookings')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', id)
    throw error
  }

  if (shouldRegisterNoShow && currentBooking.client_id) {
    const { error: violationError } = await (supabase as any).from('client_violations').insert({
      client_id: currentBooking.client_id,
      booking_id: currentBooking.id,
      violation_type: 'no_show',
      occurred_at: new Date().toISOString(),
    })
    if (violationError) throw violationError

    const { error: noShowError } = await (supabase as any).rpc('increment_client_no_show', { p_client_id: currentBooking.client_id })
    if (noShowError) throw noShowError
  }

  if (shouldRegisterLateCancel && currentBooking.client_id) {
    // Ignore errors — violation is best-effort, booking update already succeeded
    await (supabase as any).from('client_violations').insert({
      client_id: currentBooking.client_id,
      booking_id: currentBooking.id,
      violation_type: 'late_cancel',
      occurred_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ booking })
})

// DELETE /api/bookings/[id] - Soft delete booking
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: existingBooking, error: existingError } = await supabase
    .from('bookings')
    .select('id, salon_id')
    .eq('id', id)
    .single()

  if (existingError || !existingBooking || (existingBooking as any).salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Booking', id)
  }

  // This will trigger the soft_delete_booking trigger
  // which sets deleted_at and deleted_by instead of actually deleting
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', id)
    throw error
  }

  return NextResponse.json({ success: true })
})
