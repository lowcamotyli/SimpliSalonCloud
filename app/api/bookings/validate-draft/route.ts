import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { checkEquipmentAvailability, getRequiredEquipmentForService } from '@/lib/equipment/availability'

const validateDraftSchema = z.object({
  items: z.array(
    z.object({
      serviceId: z.string().nullable().optional(),
      employeeId: z.string().nullable().optional(),
      bookingDate: z.string().optional(),
      bookingTime: z.string().optional(),
    })
  ),
})

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function minutesToTime(totalMinutes: number) {
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request, { limit: 120 })
  if (rl) return rl

  const { supabase, salonId } = await getAuthContext()
  const body = validateDraftSchema.parse(await request.json())

  const serviceIds = body.items
    .map((item) => item.serviceId)
    .filter((serviceId): serviceId is string => Boolean(serviceId))

  const serviceMap = new Map<string, { duration: number }>()

  if (serviceIds.length > 0) {
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, duration')
      .eq('salon_id', salonId)
      .in('id', [...new Set(serviceIds)])

    if (servicesError) throw servicesError

    for (const service of services ?? []) {
      serviceMap.set(service.id, { duration: Number((service as any).duration) || 0 })
    }
  }

  const results = await Promise.all(
    body.items.map(async (item) => {
      const warnings: string[] = []

      if (!item.serviceId || !item.employeeId || !item.bookingDate || !item.bookingTime) {
        return { warnings }
      }

      const service = serviceMap.get(item.serviceId)
      if (!service) {
        return { warnings }
      }

      const duration = service.duration || 0
      const startMinutes = timeToMinutes(item.bookingTime)
      const endMinutes = startMinutes + duration

      const { data: existingBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, booking_time, duration, client:clients(full_name)')
        .eq('salon_id', salonId)
        .eq('employee_id', item.employeeId)
        .eq('booking_date', item.bookingDate)
        .is('deleted_at', null)
        .neq('status', 'cancelled')

      if (bookingsError) throw bookingsError

      const conflictingBookings = (existingBookings ?? []).filter((booking: any) => {
        const bookingStart = timeToMinutes(booking.booking_time)
        const bookingEnd = bookingStart + (Number(booking.duration) || 0)
        return rangesOverlap(startMinutes, endMinutes, bookingStart, bookingEnd)
      }) as any[]

      if (conflictingBookings.length > 0) {
        const occupiedUntil = conflictingBookings.reduce((latestEnd, booking) => {
          const bookingStart = timeToMinutes(booking.booking_time)
          const bookingEnd = bookingStart + (Number(booking.duration) || 0)
          return Math.max(latestEnd, bookingEnd)
        }, startMinutes)

        const conflictingClient = conflictingBookings[0]?.client?.full_name
        warnings.push(
          conflictingClient
            ? `Pracownik jest zajety co najmniej do ${minutesToTime(occupiedUntil)}. Kolizja z wizyta klienta ${conflictingClient}.`
            : `Pracownik jest zajety co najmniej do ${minutesToTime(occupiedUntil)}.`
        )
      }

      const { data: shift } = await supabase
        .from('employee_shifts')
        .select('start_time, end_time')
        .eq('salon_id', salonId)
        .eq('employee_id', item.employeeId)
        .eq('date', item.bookingDate)
        .maybeSingle()

      if (shift) {
        const shiftStart = timeToMinutes((shift as any).start_time)
        const shiftEnd = timeToMinutes((shift as any).end_time)
        if (startMinutes < shiftStart || endMinutes > shiftEnd) {
          const fmt = (t: string) => t.slice(0, 5)
          warnings.push(`Rezerwacja poza godzinami pracy pracownika (${fmt((shift as any).start_time)}–${fmt((shift as any).end_time)}).`)
        }
      }

      const requiredEquipment = await getRequiredEquipmentForService(item.serviceId)
      if (requiredEquipment.length > 0) {
        const startsAt = new Date(`${item.bookingDate}T${item.bookingTime}:00Z`)
        const endsAt = new Date(startsAt.getTime() + duration * 60_000)
        const availability = await checkEquipmentAvailability(requiredEquipment, startsAt, endsAt)
        const conflictingEquipmentIds = availability
          .filter((entry) => !entry.is_available)
          .map((entry) => entry.equipment_id)

        if (conflictingEquipmentIds.length > 0) {
          const { data: equipmentRows, error: equipmentError } = await supabase
            .from('equipment')
            .select('id, name')
            .eq('salon_id', salonId)
            .in('id', conflictingEquipmentIds)

          if (equipmentError) throw equipmentError

          const equipmentNames = (equipmentRows ?? [])
            .map((equipment: any) => equipment.name)
            .filter(Boolean)

          warnings.push(
            equipmentNames.length > 0
              ? `Zajety sprzet: ${equipmentNames.join(', ')}.`
              : 'W tym terminie wymagany sprzet jest juz zajety.'
          )
        }
      }

      return { warnings }
    })
  )

  return NextResponse.json({ results })
})
