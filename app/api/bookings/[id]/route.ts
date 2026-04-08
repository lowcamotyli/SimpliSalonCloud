import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateBookingSchema } from '@/lib/validators/booking.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'
import type { Database } from '@/types/supabase'
import { BUSINESS_HOURS } from '@/lib/constants'
import { checkEquipmentAvailability, getRequiredEquipmentForService } from '@/lib/equipment/availability'

type BookingUpdate = Database['public']['Tables']['bookings']['Update']
type BookingAddonInsert = Database['public']['Tables']['booking_addons']['Insert']

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

// PATCH /api/bookings/[id] - Update booking
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
  const forceOverride = body.force_override === true || body.forceOverride === true
  const normalizedBody = {
    ...body,
    employee_id: body.employee_id || body.employeeId,
    service_id: body.service_id || body.serviceId,
    date: body.date || body.bookingDate,
    start_time: body.start_time || body.bookingTime,
  }
  const validatedData = updateBookingSchema.parse(normalizedBody)
  const addonIds = Array.isArray(body.addon_ids)
    ? body.addon_ids
    : Array.isArray(body.addonIds)
      ? body.addonIds
      : undefined

  if (addonIds !== undefined && !addonIds.every((addonId: unknown) => typeof addonId === 'string')) {
    throw new ValidationError('Lista dodatkow musi zawierac tylko ID')
  }

  const { data: existingBooking, error: existingError } = await supabase
    .from('bookings')
    .select('id, version, employee_id, booking_date, booking_time, duration, salon_id, status, client_id, service_id, base_price, total_price')
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
    service_id: string
    base_price: number
    total_price: number | null
  }

  if (currentBooking.salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Booking', id)
  }

  const serviceChanged =
    validatedData.service_id !== undefined &&
    validatedData.service_id !== currentBooking.service_id
  const addonsChanged = addonIds !== undefined
  const targetEmployeeId = (validatedData.employee_id as string | undefined) ?? currentBooking.employee_id
  const targetServiceId = (validatedData.service_id as string | undefined) ?? currentBooking.service_id
  const targetDate = validatedData.date ?? currentBooking.booking_date
  const targetStartTime = validatedData.start_time ?? currentBooking.booking_time
  let targetDuration = Number(validatedData.duration ?? currentBooking.duration)
  let targetBasePrice = Number(currentBooking.base_price ?? 0)

  if (serviceChanged) {
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, salon_id, price, duration')
      .eq('id', targetServiceId)
      .single()

    if (serviceError || !service) {
      throw new ValidationError('Service not found')
    }

    if ((service as any).salon_id !== currentBooking.salon_id) {
      throw new ValidationError('Service not found in this salon')
    }

    const { count: serviceAssignmentCount, error: assignmentCountError } = await supabase
      .from('employee_services')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', currentBooking.salon_id)
      .eq('service_id', targetServiceId)

    if (assignmentCountError) throw assignmentCountError

    if ((serviceAssignmentCount ?? 0) > 0) {
      const { data: employeeService, error: employeeServiceError } = await supabase
        .from('employee_services')
        .select('id')
        .eq('salon_id', currentBooking.salon_id)
        .eq('employee_id', targetEmployeeId)
        .eq('service_id', targetServiceId)
        .maybeSingle()

      if (employeeServiceError) throw employeeServiceError

      if (!employeeService) {
        throw new ValidationError('Employee is not authorized to perform this service')
      }
    }

    targetBasePrice = Number((service as any).price ?? 0)
    targetDuration = Number((service as any).duration ?? 0)
  }

  if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
    throw new ValidationError('Dlugosc wizyty musi byc wieksza od 0')
  }

  const [startHour, startMinute] = String(targetStartTime).split(':').map(Number)
  const startTotalMinutes = startHour * 60 + (startMinute || 0)
  const endTotalMinutes = startTotalMinutes + targetDuration
  const businessStartMinutes = BUSINESS_HOURS.START * 60
  const businessEndMinutes = BUSINESS_HOURS.END * 60

  if (startTotalMinutes < businessStartMinutes || endTotalMinutes > businessEndMinutes) {
    throw new ValidationError('Termin wykracza poza godziny pracy')
  }

  const schedulingChanged =
    serviceChanged ||
    validatedData.date !== undefined ||
    validatedData.start_time !== undefined ||
    validatedData.duration !== undefined ||
    validatedData.employee_id !== undefined

  if (schedulingChanged && !forceOverride) {
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
      throw new ConflictError('Wybrany termin koliduje z inna wizyta')
    }
  }

  const equipmentRelevantChange =
    serviceChanged ||
    validatedData.date !== undefined ||
    validatedData.start_time !== undefined ||
    validatedData.duration !== undefined
  const startsAt = new Date(`${targetDate}T${targetStartTime}`)
  const endsAt = new Date(startsAt.getTime() + targetDuration * 60_000)
  const requiredEquipment = equipmentRelevantChange
    ? await getRequiredEquipmentForService(targetServiceId)
    : []

  if (equipmentRelevantChange && requiredEquipment.length > 0 && !forceOverride) {
    const availability = await checkEquipmentAvailability(requiredEquipment, startsAt, endsAt, id)
    const conflicts = availability.filter((entry: any) => !entry.is_available)

    if (conflicts.length > 0) {
      return NextResponse.json({
        error: 'EQUIPMENT_CONFLICT',
        message: 'Wybrany termin jest niedostepny - sprzet jest juz zajety.',
        conflictingEquipment: conflicts.map((entry: any) => entry.equipment_id),
      }, { status: 409 })
    }
  }

  let addonRowsToInsert: BookingAddonInsert[] = []
  let addonsTotal = Number((currentBooking.total_price ?? currentBooking.base_price) - currentBooking.base_price)

  if (addonsChanged) {
    const requestedAddonIds = [...new Set((addonIds as string[]).filter(Boolean))]
    addonsTotal = 0

    if (requestedAddonIds.length > 0) {
      const { data: addons, error: addonsError } = await supabase
        .from('service_addons')
        .select('id, salon_id, service_id, price_delta, duration_delta')
        .in('id', requestedAddonIds)

      if (addonsError) throw addonsError
      if ((addons ?? []).length !== requestedAddonIds.length) {
        throw new ValidationError('One or more add-ons were not found')
      }

      const invalidAddon = (addons ?? []).find((addon: any) =>
        addon.salon_id !== currentBooking.salon_id || addon.service_id !== targetServiceId
      )

      if (invalidAddon) {
        throw new ValidationError('Add-on does not belong to the selected service')
      }

      const addonMap = new Map((addons ?? []).map((addon: any) => [addon.id, addon]))
      addonRowsToInsert = requestedAddonIds.map((addonId) => {
        const addon = addonMap.get(addonId)
        return {
          booking_id: id,
          addon_id: addonId,
          price_at_booking: Number((addon as any)?.price_delta ?? 0),
          duration_at_booking: Number((addon as any)?.duration_delta ?? 0),
        }
      })
      addonsTotal = addonRowsToInsert.reduce((sum, addon) => sum + Number(addon.price_at_booking || 0), 0)
    }
  }

  const updateData: BookingUpdate = {
    version: currentBooking.version,
    updated_by: user.id,
  }

  if (validatedData.status) updateData.status = validatedData.status
  if (validatedData.paymentMethod) updateData.payment_method = validatedData.paymentMethod
  if (validatedData.surcharge !== undefined) updateData.surcharge = validatedData.surcharge
  if (validatedData.notes !== undefined) updateData.notes = validatedData.notes
  if (serviceChanged || validatedData.duration !== undefined) updateData.duration = targetDuration
  if (validatedData.employee_id) updateData.employee_id = validatedData.employee_id
  if (serviceChanged) {
    updateData.service_id = targetServiceId
    updateData.base_price = targetBasePrice
  }
  if (validatedData.date) updateData.booking_date = validatedData.date
  if (validatedData.start_time) updateData.booking_time = validatedData.start_time
  if (serviceChanged || addonsChanged) updateData.total_price = targetBasePrice + addonsTotal

  const shouldRegisterNoShow =
    validatedData.status === 'no_show' &&
    currentBooking.status !== 'no_show' &&
    !!currentBooking.client_id

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

  if (addonsChanged) {
    const { error: deleteAddonsError } = await supabase
      .from('booking_addons')
      .delete()
      .eq('booking_id', id)

    if (deleteAddonsError) throw deleteAddonsError

    if (addonRowsToInsert.length > 0) {
      const { error: insertAddonsError } = await supabase
        .from('booking_addons')
        .insert(addonRowsToInsert)

      if (insertAddonsError) throw insertAddonsError
    }
  }

  if (equipmentRelevantChange) {
    const { error: deleteEquipmentError } = await (supabase as any)
      .from('equipment_bookings')
      .delete()
      .eq('booking_id', id)

    if (deleteEquipmentError) throw deleteEquipmentError

    if (requiredEquipment.length > 0) {
      const { error: insertEquipmentError } = await (supabase as any)
        .from('equipment_bookings')
        .insert(
          requiredEquipment.map((equipmentId: string) => ({
            booking_id: id,
            equipment_id: equipmentId,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          }))
        )

      if (insertEquipmentError) throw insertEquipmentError
    }
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
