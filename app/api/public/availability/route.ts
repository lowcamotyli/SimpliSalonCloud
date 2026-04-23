import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addDaysToIsoDate, getDayOfWeekFromIsoDate, getZonedParts, resolveSalonTimeZone, zonedDateTimeToUtcIso } from '@/lib/utils/timezone'
import { buildSalonDayUtcRange, toSalonLocalMinuteBlock } from '@/lib/utils/equipment-timezone'
import { availabilityQuerySchema } from '@/lib/validators/public-booking.validators'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

interface DayHours {
    open: string | null
    close: string | null
    closed: boolean
}

interface EmployeeScheduleRow {
    day_of_week: number
    is_working: boolean
    start_time: string | null
    end_time: string | null
}

interface EmployeeExceptionRow {
    exception_date: string
    is_working: boolean
    start_time: string | null
    end_time: string | null
}

interface BookingRow {
    booking_time: string
    duration: number
    employee_id: string
}

interface EquipmentBlockRow {
    starts_at: string
    ends_at: string
}

interface EmployeeAbsenceRow {
    employee_id: string
    start_date: string
    end_date: string
}

interface TimeReservationRow {
    employee_id: string
    start_at: string
    end_at: string
}

interface PremiumSlotRow {
    name: string
    price_modifier: number | null
    requires_prepayment: boolean
    start_time: string
    end_time: string
    employee_id: string | null
    service_ids: string[] | null
}

interface PremiumSlotMeta {
    name: string
    priceModifier: number | null
    requiresPrepayment: boolean
}

function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
}

function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Zwraca [startMin, endMin] dostępności pracownika na dany dzień lub null gdy niedostępny */
function resolveEmployeeWindow(
    dayOfWeek: number,
    date: string,
    schedules: EmployeeScheduleRow[],
    exceptions: EmployeeExceptionRow[]
): [number, number] | null {
    // 1. Sprawdź wyjątek na ten dzień
    const exc = exceptions.find(e => e.exception_date === date)
    if (exc) {
        if (!exc.is_working || !exc.start_time || !exc.end_time) return null
        return [parseTimeToMinutes(exc.start_time), parseTimeToMinutes(exc.end_time)]
    }
    // 2. Sprawdź stały grafik
    const day = schedules.find(s => s.day_of_week === dayOfWeek)
    if (!day || !day.is_working || !day.start_time || !day.end_time) return null
    return [parseTimeToMinutes(day.start_time), parseTimeToMinutes(day.end_time)]
}

/** Generuje wolne sloty w przedziale czasowym z uwzględnieniem zajętych bookingów i sprzętu */
function generateSlots(
    startMin: number,
    endMin: number,
    serviceDuration: number,
    bookings: BookingRow[],
    employeeId?: string | null,
    equipmentBlocks?: [number, number][]
): string[] {
    const slots: string[] = []
    for (let minutes = startMin; minutes < endMin; minutes += 30) {
        const slotEnd = minutes + serviceDuration
        if (slotEnd > endMin) continue

        const bookingConflict = bookings.some((b) => {
            if (employeeId && b.employee_id !== employeeId) return false
            const [bh, bm] = b.booking_time.split(':').map(Number)
            const bStart = bh * 60 + bm
            const bEnd = bStart + b.duration
            return minutes < bEnd && slotEnd > bStart
        })
        if (bookingConflict) continue

        const equipmentConflict = equipmentBlocks?.some(([eqStart, eqEnd]) =>
            minutes < eqEnd && slotEnd > eqStart
        )
        if (equipmentConflict) continue

        slots.push(minutesToTime(minutes))
    }
    return slots
}

function buildPremiumMeta(
    slotsSet: Set<string>,
    premiumSlots: PremiumSlotRow[],
    serviceId: string,
    employeeId?: string
): Record<string, PremiumSlotMeta> {
    const premiumMeta: Record<string, PremiumSlotMeta> = {}

    for (const slot of slotsSet) {
        const slotMinutes = parseTimeToMinutes(slot)
        for (const premiumSlot of premiumSlots) {
            if (employeeId && premiumSlot.employee_id && premiumSlot.employee_id !== employeeId) {
                continue
            }
            if (premiumSlot.service_ids && !premiumSlot.service_ids.includes(serviceId)) {
                continue
            }
            const premiumStartMinutes = parseTimeToMinutes(premiumSlot.start_time)
            const premiumEndMinutes = parseTimeToMinutes(premiumSlot.end_time)
            if (
                slotMinutes >= premiumStartMinutes &&
                slotMinutes < premiumEndMinutes
            ) {
                premiumMeta[slot] = {
                    name: premiumSlot.name,
                    priceModifier: premiumSlot.price_modifier,
                    requiresPrepayment: premiumSlot.requires_prepayment,
                }
                break
            }
        }
    }

    return premiumMeta
}

function toReservationBlock(row: TimeReservationRow, timeZone: string, targetDate: string): [number, number] | null {
    const start = new Date(row.start_at)
    const end = new Date(row.end_at)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null

    const zonedStart = getZonedParts(start, timeZone)
    const zonedEnd = getZonedParts(end, timeZone)

    if (zonedEnd.date < targetDate || zonedStart.date > targetDate) return null

    const blockStart = zonedStart.date < targetDate ? 0 : zonedStart.hour * 60 + zonedStart.minute
    const blockEnd = zonedEnd.date > targetDate ? 24 * 60 : zonedEnd.hour * 60 + zonedEnd.minute

    if (blockEnd <= blockStart) return null
    return [blockStart, blockEnd]
}

function overlapsReservation(slotStart: number, slotEnd: number, reservationBlocks: [number, number][]): boolean {
    return reservationBlocks.some(([reservationStart, reservationEnd]) =>
        slotStart < reservationEnd && slotEnd > reservationStart
    )
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const authResult = await resolveApiKey(request)
    if (authResult instanceof NextResponse) return authResult
    const { salonId } = authResult

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = availabilityQuerySchema.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
    }

    const { date, serviceId, employeeId } = parsed.data
    const supabase = createAdminSupabaseClient()

    // Pobierz duration usługi
    const { data: service } = await supabase
        .from('services')
        .select('duration')
        .eq('id', serviceId)
        .eq('salon_id', salonId)
        .single()

    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

    // Pobierz wymagany sprzęt dla usługi i jego zajętość w danym dniu
    const { data: serviceEquipmentRows } = await supabase
        .from('service_equipment')
        .select('equipment_id')
        .eq('service_id', serviceId)
    const requiredEquipmentIds = (serviceEquipmentRows ?? []).map((r: { equipment_id: string }) => r.equipment_id)

    // Pobierz godziny otwarcia salonu
    const { data: settings } = await supabase
        .from('salon_settings')
        .select('operating_hours, timezone')
        .eq('salon_id', salonId)
        .maybeSingle()

    const operatingHours = (settings?.operating_hours ?? null) as Record<string, DayHours> | null
    const salonTimeZone = resolveSalonTimeZone(settings?.timezone ?? null)

    let equipmentBlocks: [number, number][] = []
    if (requiredEquipmentIds.length > 0) {
        const { startIso: dayStartIso, endIso: dayEndIso } = buildSalonDayUtcRange(date, salonTimeZone)
        const { data: eqBookings } = await supabase
            .from('equipment_bookings')
            .select('starts_at, ends_at')
            .in('equipment_id', requiredEquipmentIds)
            .lt('starts_at', dayEndIso)
            .gt('ends_at', dayStartIso)
        equipmentBlocks = ((eqBookings ?? []) as EquipmentBlockRow[])
            .map((eb) => toSalonLocalMinuteBlock(eb, salonTimeZone, date))
            .filter((value): value is [number, number] => value !== null)
    }
    const dayOfWeek = getDayOfWeekFromIsoDate(date)
    const dayName = DAY_NAMES[dayOfWeek]
    const dayHours: DayHours = operatingHours?.[dayName] ?? { open: '09:00', close: '17:00', closed: false }

    if (dayHours.closed) {
        return NextResponse.json({ date, serviceId, slots: [], premiumMeta: {} })
    }

    const salonOpen = parseTimeToMinutes(dayHours.open ?? '09:00')
    const salonClose = parseTimeToMinutes(dayHours.close ?? '17:00')

    // Pobierz zajęte sloty (ze wszystkich pracowników lub konkretnego)
    let bookingsQuery = supabase
        .from('bookings')
        .select('booking_time, duration, employee_id')
        .eq('salon_id', salonId)
        .eq('booking_date', date)
        .not('status', 'eq', 'cancelled')
        .is('deleted_at', null)

    if (employeeId) {
        bookingsQuery = bookingsQuery.eq('employee_id', employeeId)
    }

    const { data: bookings } = await bookingsQuery
    const bookingRows: BookingRow[] = (bookings ?? []) as BookingRow[]
    const dayStartIso = zonedDateTimeToUtcIso(date, '00:00', salonTimeZone)
    const dayEndIso = zonedDateTimeToUtcIso(addDaysToIsoDate(date, 1), '00:00', salonTimeZone)

    // --- Tryb z konkretnym pracownikiem ---
    if (employeeId) {
        const [{ data: schedules }, { data: exceptions }, { data: absences }, { data: reservations }] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('day_of_week, is_working, start_time, end_time')
                .eq('employee_id', employeeId),
            supabase
                .from('employee_schedule_exceptions')
                .select('exception_date, is_working, start_time, end_time')
                .eq('employee_id', employeeId)
                .eq('exception_date', date),
            supabase
                .from('employee_absences')
                .select('employee_id, start_date, end_date')
                .eq('salon_id', salonId)
                .eq('employee_id', employeeId)
                .lte('start_date', date)
                .gte('end_date', date),
            supabase
                .from('time_reservations')
                .select('employee_id, start_at, end_at')
                .eq('salon_id', salonId)
                .eq('employee_id', employeeId)
                .lt('start_at', dayEndIso)
                .gt('end_at', dayStartIso),
        ])

        const window = resolveEmployeeWindow(
            dayOfWeek,
            date,
            (schedules ?? []) as EmployeeScheduleRow[],
            (exceptions ?? []) as EmployeeExceptionRow[]
        )

        if (!window) return NextResponse.json({ date, serviceId, slots: [], premiumMeta: {} })
        if ((absences ?? []).length > 0) {
            return NextResponse.json({ date, serviceId, slots: [], premiumMeta: {} })
        }

        const [empStart, empEnd] = window
        const effectiveStart = Math.max(salonOpen, empStart)
        const effectiveEnd = Math.min(salonClose, empEnd)

        if (effectiveStart >= effectiveEnd) {
            return NextResponse.json({ date, serviceId, slots: [], premiumMeta: {} })
        }

        const reservationBlocks = ((reservations ?? []) as TimeReservationRow[])
            .map((row) => toReservationBlock(row, salonTimeZone, date))
            .filter((value): value is [number, number] => value !== null)
        const slots = generateSlots(effectiveStart, effectiveEnd, service.duration, bookingRows, employeeId, equipmentBlocks)
            .filter((slot) => {
                const slotStart = parseTimeToMinutes(slot)
                const slotEnd = slotStart + service.duration
                return !overlapsReservation(slotStart, slotEnd, reservationBlocks)
            })
        const slotsSet = new Set<string>(slots)
        const { data: premiumSlotsData } = await supabase
            .from('premium_slots')
            .select('name, price_modifier, requires_prepayment, start_time, end_time, employee_id, service_ids')
            .eq('salon_id', salonId)
            .eq('date', date)
            .order('start_time', { ascending: true })
        const premiumMeta = buildPremiumMeta(
            slotsSet,
            (premiumSlotsData ?? []) as PremiumSlotRow[],
            serviceId,
            employeeId
        )
        return NextResponse.json({ date, serviceId, slots, premiumMeta })
    }

    // --- Tryb bez konkretnego pracownika: unia slotów wszystkich dostępnych pracowników ---
    const { data: employees } = await supabase
        .from('employees')
        .select('id')
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)

    if (!employees || employees.length === 0) {
        return NextResponse.json({ date, serviceId, slots: [], premiumMeta: {} })
    }

    const empIds = (employees as { id: string }[]).map(e => e.id)

    const [{ data: allSchedules }, { data: allExceptions }, { data: allAbsences }, { data: allReservations }] = await Promise.all([
        supabase
            .from('employee_schedules')
            .select('employee_id, day_of_week, is_working, start_time, end_time')
            .in('employee_id', empIds),
        supabase
            .from('employee_schedule_exceptions')
            .select('employee_id, exception_date, is_working, start_time, end_time')
            .in('employee_id', empIds)
            .eq('exception_date', date),
        supabase
            .from('employee_absences')
            .select('employee_id, start_date, end_date')
            .eq('salon_id', salonId)
            .in('employee_id', empIds)
            .lte('start_date', date)
            .gte('end_date', date),
        supabase
            .from('time_reservations')
            .select('employee_id, start_at, end_at')
            .eq('salon_id', salonId)
            .in('employee_id', empIds)
            .lt('start_at', dayEndIso)
            .gt('end_at', dayStartIso),
    ])

    const schedulesByEmp = new Map<string, EmployeeScheduleRow[]>()
    const exceptionsByEmp = new Map<string, EmployeeExceptionRow[]>()
    const absencesByEmp = new Map<string, EmployeeAbsenceRow[]>()
    const reservationBlocksByEmp = new Map<string, [number, number][]>()

    for (const row of (allSchedules ?? []) as (EmployeeScheduleRow & { employee_id: string })[]) {
        if (!schedulesByEmp.has(row.employee_id)) schedulesByEmp.set(row.employee_id, [])
        schedulesByEmp.get(row.employee_id)!.push(row)
    }
    for (const row of (allExceptions ?? []) as (EmployeeExceptionRow & { employee_id: string })[]) {
        if (!exceptionsByEmp.has(row.employee_id)) exceptionsByEmp.set(row.employee_id, [])
        exceptionsByEmp.get(row.employee_id)!.push(row)
    }
    for (const row of (allAbsences ?? []) as EmployeeAbsenceRow[]) {
        if (!absencesByEmp.has(row.employee_id)) absencesByEmp.set(row.employee_id, [])
        absencesByEmp.get(row.employee_id)!.push(row)
    }
    for (const row of (allReservations ?? []) as TimeReservationRow[]) {
        const block = toReservationBlock(row, salonTimeZone, date)
        if (!block) continue
        if (!reservationBlocksByEmp.has(row.employee_id)) reservationBlocksByEmp.set(row.employee_id, [])
        reservationBlocksByEmp.get(row.employee_id)!.push(block)
    }

    const slotsSet = new Set<string>()

    for (const empId of empIds) {
        if ((absencesByEmp.get(empId) ?? []).length > 0) continue

        const window = resolveEmployeeWindow(
            dayOfWeek,
            date,
            schedulesByEmp.get(empId) ?? [],
            exceptionsByEmp.get(empId) ?? []
        )
        if (!window) continue

        const [empStart, empEnd] = window
        const effectiveStart = Math.max(salonOpen, empStart)
        const effectiveEnd = Math.min(salonClose, empEnd)
        if (effectiveStart >= effectiveEnd) continue

        const empBookings = bookingRows.filter(b => b.employee_id === empId)
        const reservationBlocks = reservationBlocksByEmp.get(empId) ?? []
        const empSlots = generateSlots(effectiveStart, effectiveEnd, service.duration, empBookings, empId, equipmentBlocks)
            .filter((slot) => {
                const slotStart = parseTimeToMinutes(slot)
                const slotEnd = slotStart + service.duration
                return !overlapsReservation(slotStart, slotEnd, reservationBlocks)
            })
        for (const s of empSlots) slotsSet.add(s)
    }

    const slots = Array.from(slotsSet).sort()
    const { data: premiumSlotsData } = await supabase
        .from('premium_slots')
        .select('name, price_modifier, requires_prepayment, start_time, end_time, employee_id, service_ids')
        .eq('salon_id', salonId)
        .eq('date', date)
        .order('start_time', { ascending: true })
    const premiumMeta = buildPremiumMeta(
        slotsSet,
        (premiumSlotsData ?? []) as PremiumSlotRow[],
        serviceId,
        employeeId
    )
    return NextResponse.json({ date, serviceId, slots, premiumMeta })
}
