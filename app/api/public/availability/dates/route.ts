import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
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
        .select('operating_hours')
        .eq('salon_id', salonId)
        .maybeSingle()

    const operatingHours = (settings?.operating_hours ?? null) as Record<string, DayHours> | null

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

    console.log("DATES API FETCH:", { startDate, endDate, empIds, allExceptions, schedulesByEmp: Array.from(schedulesByEmp.keys()) })

    // Sprzet - optional optimization, moglibysmy tu sciagnac caly miesiac tak samo
    const { data: serviceEquipmentRows } = await supabase
        .from('service_equipment')
        .select('equipment_id')
        .eq('service_id', serviceId)
    const requiredEquipmentIds = (serviceEquipmentRows ?? []).map((r: { equipment_id: string }) => r.equipment_id)

    let allEquipmentBlocks: EquipmentBlockRow[] = []
    if (requiredEquipmentIds.length > 0) {
        const { data: eqBookings } = await supabase
            .from('equipment_bookings')
            .select('starts_at, ends_at')
            .in('equipment_id', requiredEquipmentIds)
            .lt('starts_at', `${endDate}T23:59:59.999Z`)
            .gt('ends_at', `${startDate}T00:00:00.000Z`)
        allEquipmentBlocks = (eqBookings ?? []) as EquipmentBlockRow[]
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    const availableDates: string[] = []

    for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
        const dateStr = current.toISOString().split('T')[0]
        const dayOfWeek = current.getUTCDay()
        const dayName = DAY_NAMES[dayOfWeek]
        const dayHours: DayHours = operatingHours?.[dayName] ?? { open: '09:00', close: '17:00', closed: false }

        if (dayHours.closed) continue

        const salonOpen = parseTimeToMinutes(dayHours.open ?? '09:00')
        const salonClose = parseTimeToMinutes(dayHours.close ?? '17:00')

        const dayBookings = (bookings ?? []).filter(b => b.booking_date === dateStr) as BookingRow[]

        let eqBlocksForDay: [number, number][] = []
        if (allEquipmentBlocks.length > 0) {
            const dayStart = new Date(`${dateStr}T00:00:00.000Z`)
            const dayEnd = new Date(`${dateStr}T23:59:59.999Z`)
            eqBlocksForDay = allEquipmentBlocks
                .filter(eb => new Date(eb.starts_at) < dayEnd && new Date(eb.ends_at) > dayStart)
                .map(eb => {
                    const s = new Date(eb.starts_at)
                    const e = new Date(eb.ends_at)
                    // Convert UTCHours appropriately
                    return [s.getUTCHours() * 60 + s.getUTCMinutes(), e.getUTCHours() * 60 + e.getUTCMinutes()]
                })
        }

        let isDayAvailable = false

        for (const empId of empIds) {
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

            const hasAnySlots = hasSlots(
                effectiveStart,
                effectiveEnd,
                service.duration,
                dayBookings,
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

    console.log("DATES API RESULT:", { availableDates })

    return NextResponse.json({ availableDates })
}
