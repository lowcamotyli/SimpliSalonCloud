import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { canEmployeePerformService } from '@/lib/bookings/employee-service-authorization'
import { recalculateGroupTotal } from '@/lib/bookings/recalculate-group-total'
import { findTimeReservationConflict, formatTimeReservationConflictMessage } from '@/lib/bookings/time-reservation-conflicts'
import type { TablesInsert } from '@/types/supabase'

interface AddGroupBookingBody {
  service_id: string
  employee_id: string
  start_time: string
  booking_date: string
  addon_ids?: string[]
  force_override?: boolean
}

interface TimeRangeBooking {
  id: string
  booking_time: string
  duration: number
}

function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
): Promise<NextResponse> {
  try {
    const { groupId } = await params
    const { supabase, salonId: authSalonId } = await getAuthContext()
    const body = (await request.json()) as Partial<AddGroupBookingBody>

    const serviceId = typeof body.service_id === 'string' ? body.service_id.trim() : ''
    const employeeId = typeof body.employee_id === 'string' ? body.employee_id.trim() : ''
    const startTime = typeof body.start_time === 'string' ? body.start_time.trim() : ''
    const bookingDate = typeof body.booking_date === 'string' ? body.booking_date.trim() : ''
    const forceOverride = body.force_override === true

    if (!serviceId || !employeeId || !startTime || !bookingDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isValidDate(bookingDate) || toMinutes(startTime) === null) {
      return NextResponse.json({ error: 'Invalid date or time format' }, { status: 400 })
    }

    const { data: visitGroup, error: visitGroupError } = await supabase
      .from('visit_groups')
      .select('id, client_id')
      .eq('id', groupId)
      .eq('salon_id', authSalonId)
      .single()

    if (visitGroupError || !visitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 })
    }

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, price, duration')
      .eq('id', serviceId)
      .eq('salon_id', authSalonId)
      .single()

    if (serviceError || !service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const canPerformService = await canEmployeePerformService(
      supabase as any,
      authSalonId,
      employeeId,
      serviceId
    )

    if (!canPerformService) {
      return NextResponse.json({ error: 'Employee is not authorized to perform this service' }, { status: 400 })
    }

    const duration = Number(service.duration) || 0
    const startMinutes = toMinutes(startTime)

    if (startMinutes === null || duration <= 0) {
      return NextResponse.json({ error: 'Invalid duration or start time' }, { status: 400 })
    }

    const endMinutes = startMinutes + duration

    const { data: requiredEquipmentRows, error: equipmentRequirementsError } = await supabase
      .from('service_equipment')
      .select('equipment_id')
      .eq('service_id', serviceId)

    if (equipmentRequirementsError) {
      throw equipmentRequirementsError
    }

    const requiredEquipmentIds = (requiredEquipmentRows ?? []).map((row) => row.equipment_id)

    if (!forceOverride) {
      const { data: employeeBookings, error: employeeBookingsError } = await supabase
        .from('bookings')
        .select('id, booking_time, duration')
        .eq('salon_id', authSalonId)
        .eq('employee_id', employeeId)
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled')
        .is('deleted_at', null)

      if (employeeBookingsError) {
        throw employeeBookingsError
      }

      const hasEmployeeConflict = (employeeBookings ?? []).some((booking) => {
        const existingStart = toMinutes(String(booking.booking_time))
        if (existingStart === null) return false
        const existingEnd = existingStart + (Number(booking.duration) || 0)
        return overlaps(startMinutes, endMinutes, existingStart, existingEnd)
      })

      if (hasEmployeeConflict) {
        return NextResponse.json({ error: 'conflict', conflictType: 'employee' }, { status: 409 })
      }

      const timeReservationConflict = await findTimeReservationConflict({
        supabase: supabase as any,
        salonId: authSalonId,
        employeeId,
        date: bookingDate,
        startTime,
        durationMinutes: duration,
      })

      if (timeReservationConflict) {
        return NextResponse.json({
          error: 'TIME_RESERVATION_CONFLICT',
          message: formatTimeReservationConflictMessage(timeReservationConflict),
          conflictType: 'time_reservation',
        }, { status: 409 })
      }

      if (requiredEquipmentIds.length > 0) {
        const { data: overlappingBookings, error: overlappingBookingsError } = await supabase
          .from('bookings')
          .select('id, booking_time, duration')
          .eq('salon_id', authSalonId)
          .eq('booking_date', bookingDate)
          .neq('status', 'cancelled')
          .is('deleted_at', null)

        if (overlappingBookingsError) {
          throw overlappingBookingsError
        }

        const conflictingBookingIds = (overlappingBookings as TimeRangeBooking[] | null ?? [])
          .filter((booking) => {
            const existingStart = toMinutes(String(booking.booking_time))
            if (existingStart === null) return false
            const existingEnd = existingStart + (Number(booking.duration) || 0)
            return overlaps(startMinutes, endMinutes, existingStart, existingEnd)
          })
          .map((booking) => booking.id)

        if (conflictingBookingIds.length > 0) {
          const { data: equipmentConflicts, error: equipmentConflictsError } = await supabase
            .from('equipment_bookings')
            .select('id')
            .in('booking_id', conflictingBookingIds)
            .in('equipment_id', requiredEquipmentIds)
            .limit(1)

          if (equipmentConflictsError) {
            throw equipmentConflictsError
          }

          if ((equipmentConflicts ?? []).length > 0) {
            return NextResponse.json({ error: 'conflict', conflictType: 'equipment' }, { status: 409 })
          }
        }
      }
    }

    const bookingInsert: TablesInsert<'bookings'> = {
      salon_id: authSalonId,
      client_id: visitGroup.client_id,
      service_id: serviceId,
      employee_id: employeeId,
      booking_date: bookingDate,
      booking_time: startTime,
      duration,
      base_price: Number(service.price) || 0,
      visit_group_id: groupId,
      status: 'scheduled',
    }

    const { data: createdBooking, error: bookingInsertError } = await supabase
      .from('bookings')
      .insert(bookingInsert)
      .select('id')
      .single()

    if (bookingInsertError || !createdBooking) {
      throw bookingInsertError ?? new Error('Failed to create booking')
    }

    if (requiredEquipmentIds.length > 0) {
      const startsAt = new Date(`${bookingDate}T${startTime}:00Z`)
      const endsAt = new Date(startsAt.getTime() + duration * 60_000)

      const equipmentRows: TablesInsert<'equipment_bookings'>[] = requiredEquipmentIds.map((equipmentId) => ({
        booking_id: createdBooking.id,
        equipment_id: equipmentId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      }))

      const { error: insertEquipmentError } = await supabase.from('equipment_bookings').insert(equipmentRows)

      if (insertEquipmentError) {
        throw insertEquipmentError
      }
    }

    const addonIds = Array.isArray(body.addon_ids)
      ? [...new Set(body.addon_ids.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))]
      : []

    if (addonIds.length > 0) {
      const { data: addons, error: addonsError } = await supabase
        .from('service_addons')
        .select('id, price_delta, duration_delta')
        .eq('salon_id', authSalonId)
        .eq('service_id', serviceId)
        .eq('is_active', true)
        .in('id', addonIds)

      if (addonsError) {
        throw addonsError
      }

      if ((addons ?? []).length !== addonIds.length) {
        return NextResponse.json({ error: 'Invalid add-ons' }, { status: 400 })
      }

      const bookingAddonRows: TablesInsert<'booking_addons'>[] = (addons ?? []).map((addon) => ({
        booking_id: createdBooking.id,
        addon_id: addon.id,
        price_at_booking: Number(addon.price_delta) || 0,
        duration_at_booking: Number(addon.duration_delta) || 0,
      }))

      const { error: bookingAddonsError } = await supabase
        .from('booking_addons')
        .insert(bookingAddonRows)

      if (bookingAddonsError) {
        throw bookingAddonsError
      }
    }

    const groupTotalPrice = await recalculateGroupTotal(supabase, groupId)

    return NextResponse.json(
      {
        booking_id: createdBooking.id,
        group_total_price: groupTotalPrice,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    const err = error as { name?: string }

    if (err.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (err.name === 'NotFoundError') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    console.error('Unexpected error adding booking to group:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
