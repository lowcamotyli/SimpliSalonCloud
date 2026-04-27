import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addDaysToIsoDate, getDayOfWeekFromIsoDate, getZonedParts, resolveSalonTimeZone } from '@/lib/utils/timezone'
import { buildSalonDateRangeUtc, toSalonLocalMinuteBlock } from '@/lib/utils/equipment-timezone'
import { availabilityDatesQuerySchema } from '@/lib/validators/public-booking.validators'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

interface DayHours {
    open: string | null
    close: string | null
    closed: boolean
}

interface EmployeeScheduleRow {
    employee_id: string
    day_of_week: number
    is_working: boolean
    start_time: string | null
    end_time: string | null
}

interface EmployeeExceptionRow {
    employee_id: string
    exception_date: string
    is_working: boolean
    start_time: string | null
    end_time: string | null
}

interface BookingRow {
    booking_date: string
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

function toTimeString(minutes: number): string {
    const hh = Math.floor(minutes / 60)
    const mm = minutes % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
}

function resolveEmployeeWindow(
    dayOfWeek: number,
    date: string,
    schedules: EmployeeScheduleRow[],
    exceptions: EmployeeExceptionRow[]
): [number, number] | null {
    const exc = exceptions.find(e => e.exception_date === date)
    if (exc) {
        if (!exc.is_working || !exc.start_time || !exc.end_time) return null
        return [parseTimeToMinutes(exc.start_time), parseTimeToMinutes(exc.end_time)]
    }
    const day = schedules.find(s => s.day_of_week === dayOfWeek)
    if (!day || !day.is_working || !day.start_time || !day.end_time) return null
    return [parseTimeToMinutes(day.start_time), parseTimeToMinutes(day.end_time)]
}

function hasSlots(
    startMin: number,
    endMin: number,
    serviceDuration: number,
    bookings: BookingRow[],
    employeeId?: string | null,
    equipmentBlocks?: [number, number][]
): boolean {
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

        return true // Zwroć prawde od razu po znalezieniu min 1 slota
    }
    return false
}

export async function GET(request: NextRequest) {
    const authResult = await resolveApiKey(request)
    if (authResult instanceof NextResponse) return authResult
    const { salonId } = authResult

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = availabilityDatesQuerySchema.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
    }

    const { startDate, endDate, serviceId, employeeId } = parsed.data
    const supabase = createAdminSupabaseClient()

    // 1. Pobierz service duration
    const { data: service } = await supabase
        .from('services')
        .select('duration')
        .eq('id', serviceId)
        .eq('salon_id', salonId)
        .single()

    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

    // 2. Pobierz pracownikow
    let empIds: string[] = []
    if (employeeId) {
        empIds = [employeeId]
    } else {
        const { data: employees } = await supabase
            .from('employees')
            .select('id')
            .eq('salon_id', salonId)
            .eq('active', true)
            .is('deleted_at', null)
        if (!employees || employees.length === 0) {
            return NextResponse.json({ availableDates: [] })
        }
        empIds = employees.map(e => e.id)
    }

    // 3. Pobierz godziny otwarcia
    const { data: settings } = await supabase
        .from('salon_settings')
        .select('operating_hours, timezone')
        .eq('salon_id', salonId)
        .maybeSingle()

    const operatingHours = (settings?.operating_hours ?? null) as Record<string, DayHours> | null
    const salonTimeZone = resolveSalonTimeZone(settings?.timezone ?? null)

    // 4. Inne potrzebne dane (grafiki, rezerwacje, sprzet) w przedziale dat
    const [{ data: allSchedules }, { data: allExceptions }, { data: bookings }] = await Promise.all([
        supabase
            .from('employee_schedules')
            .select('employee_id, day_of_week, is_working, start_time, end_time')
            .in('employee_id', empIds),
        supabase
            .from('employee_schedule_exceptions')
            .select('employee_id, exception_date, is_working, start_time, end_time')
            .in('employee_id', empIds)
            .gte('exception_date', startDate)
            .lte('exception_date', endDate),
        supabase
            .from('bookings')
            .select('booking_date, booking_time, duration, employee_id')
            .eq('salon_id', salonId)
            .gte('booking_date', startDate)
            .lte('booking_date', endDate)
            .in('employee_id', empIds)
            .not('status', 'eq', 'cancelled')
            .is('deleted_at', null)
    ])

    const schedulesByEmp = new Map<string, EmployeeScheduleRow[]>()
    for (const row of (allSchedules ?? []) as EmployeeScheduleRow[]) {
        if (!schedulesByEmp.has(row.employee_id)) schedulesByEmp.set(row.employee_id, [])
        schedulesByEmp.get(row.employee_id)!.push(row)
    }

    const exceptionsByEmp = new Map<string, EmployeeExceptionRow[]>()
    for (const row of (allExceptions ?? []) as EmployeeExceptionRow[]) {
        if (!exceptionsByEmp.has(row.employee_id)) exceptionsByEmp.set(row.employee_id, [])
        exceptionsByEmp.get(row.employee_id)!.push(row)
    }

    // Sprzet - optional optimization, moglibysmy tu sciagnac caly miesiac tak samo
    const { data: serviceEquipmentRows } = await supabase
        .from('service_equipment')
        .select('equipment_id')
        .eq('service_id', serviceId)
    const requiredEquipmentIds = (serviceEquipmentRows ?? []).map((r: { equipment_id: string }) => r.equipment_id)

    let allEquipmentBlocks: EquipmentBlockRow[] = []
    if (requiredEquipmentIds.length > 0) {
        const { startIso: equipmentRangeStartIso, endExclusiveIso: equipmentRangeEndExclusiveIso } =
            buildSalonDateRangeUtc(startDate, endDate, salonTimeZone)
        const { data: eqBookings } = await supabase
            .from('equipment_bookings')
            .select('starts_at, ends_at')
            .in('equipment_id', requiredEquipmentIds)
            .lt('starts_at', equipmentRangeEndExclusiveIso)
            .gt('ends_at', equipmentRangeStartIso)
        allEquipmentBlocks = (eqBookings ?? []) as EquipmentBlockRow[]
    }

    const { startIso: rangeStart, endExclusiveIso: rangeEndPlusOneIso } = buildSalonDateRangeUtc(
        startDate,
        endDate,
        salonTimeZone
    )

    const [{ data: employeeAbsences }, { data: timeReservations }] = await Promise.all([
        supabase
            .from('employee_absences')
            .select('employee_id, start_date, end_date')
            .eq('salon_id', salonId)
            .in('employee_id', empIds)
            .lte('start_date', endDate)
            .gte('end_date', startDate),
        supabase
            .from('time_reservations')
            .select('employee_id, start_at, end_at')
            .eq('salon_id', salonId)
            .in('employee_id', empIds)
            .lt('start_at', rangeEndPlusOneIso)
            .gt('end_at', rangeStart)
    ])

    const absencesByEmp = new Map<string, EmployeeAbsenceRow[]>()
    for (const row of (employeeAbsences ?? []) as EmployeeAbsenceRow[]) {
        if (!absencesByEmp.has(row.employee_id)) absencesByEmp.set(row.employee_id, [])
        absencesByEmp.get(row.employee_id)!.push(row)
    }

    const reservationsByEmpAndDate = new Map<string, BookingRow[]>()
    for (const row of (timeReservations ?? []) as TimeReservationRow[]) {
        const reservationStart = new Date(row.start_at)
        const reservationEnd = new Date(row.end_at)
        if (Number.isNaN(reservationStart.getTime()) || Number.isNaN(reservationEnd.getTime()) || reservationEnd <= reservationStart) {
            continue
        }

        const zonedStart = getZonedParts(reservationStart, salonTimeZone)
        const zonedEnd = getZonedParts(reservationEnd, salonTimeZone)
        let cursorDate = zonedStart.date

        while (cursorDate <= zonedEnd.date) {
            if (cursorDate >= startDate && cursorDate <= endDate) {
                const startMinutes = cursorDate === zonedStart.date ? zonedStart.hour * 60 + zonedStart.minute : 0
                const endMinutes = cursorDate === zonedEnd.date ? zonedEnd.hour * 60 + zonedEnd.minute : 24 * 60
                const duration = endMinutes - startMinutes
                if (duration > 0) {
                    const key = `${row.employee_id}|${cursorDate}`
                    if (!reservationsByEmpAndDate.has(key)) reservationsByEmpAndDate.set(key, [])
                    reservationsByEmpAndDate.get(key)!.push({
                        booking_date: cursorDate,
                        booking_time: toTimeString(startMinutes),
                        duration,
                        employee_id: row.employee_id
                    })
                }
            }
            cursorDate = addDaysToIsoDate(cursorDate, 1)
        }
    }

    const availableDates: string[] = []

    for (let dateStr = startDate; dateStr <= endDate; dateStr = addDaysToIsoDate(dateStr, 1)) {
        const dayOfWeek = getDayOfWeekFromIsoDate(dateStr)
        const dayName = DAY_NAMES[dayOfWeek]
        const dayHours: DayHours = operatingHours?.[dayName] ?? { open: '09:00', close: '17:00', closed: false }

        if (dayHours.closed) continue

        const salonOpen = parseTimeToMinutes(dayHours.open ?? '09:00')
        const salonClose = parseTimeToMinutes(dayHours.close ?? '17:00')

        const dayBookings = (bookings ?? []).filter(b => b.booking_date === dateStr) as BookingRow[]

        const eqBlocksForDay: [number, number][] = allEquipmentBlocks
            .map((block) => toSalonLocalMinuteBlock(block, salonTimeZone, dateStr))
            .filter((value): value is [number, number] => value !== null)

        let isDayAvailable = false

        for (const empId of empIds) {
            const employeeAbsencesForDay = absencesByEmp.get(empId) ?? []
            const isEmployeeAbsent = employeeAbsencesForDay.some((absence) =>
                absence.start_date <= dateStr && absence.end_date >= dateStr
            )
            if (isEmployeeAbsent) continue

            const window = resolveEmployeeWindow(
                dayOfWeek,
                dateStr,
                schedulesByEmp.get(empId) ?? [],
                exceptionsByEmp.get(empId) ?? []
            )
            if (!window) continue

            const [empStart, empEnd] = window
            const effectiveStart = Math.max(salonOpen, empStart)
            const effectiveEnd = Math.min(salonClose, empEnd)
            if (effectiveStart >= effectiveEnd) continue

            const employeeReservationsForDay = reservationsByEmpAndDate.get(`${empId}|${dateStr}`) ?? []
            const employeeDayBookings = dayBookings.concat(employeeReservationsForDay)
            const hasAnySlots = hasSlots(
                effectiveStart,
                effectiveEnd,
                service.duration,
                employeeDayBookings,
                empId,
                eqBlocksForDay
            )

            if (hasAnySlots) {
                isDayAvailable = true
                break
            }
        }

        if (isDayAvailable) {
            availableDates.push(dateStr)
        }
    }

    return NextResponse.json({ availableDates })
}
