import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { availabilityQuerySchema } from '@/lib/validators/public-booking.validators'
import { getSalonId } from '@/lib/utils/salon'

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

export async function GET(request: NextRequest) {
    const authError = validateApiKey(request)
    if (authError) return authError

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = availabilityQuerySchema.safeParse(params)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
    }

    const { date, serviceId, employeeId } = parsed.data
    const supabase = createAdminSupabaseClient()
    const salonId = getSalonId(request)

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

    let equipmentBlocks: [number, number][] = []
    if (requiredEquipmentIds.length > 0) {
        const dayStart = `${date}T00:00:00.000Z`
        const dayEnd = `${date}T23:59:59.999Z`
        const { data: eqBookings } = await supabase
            .from('equipment_bookings')
            .select('starts_at, ends_at')
            .in('equipment_id', requiredEquipmentIds)
            .lt('starts_at', dayEnd)
            .gt('ends_at', dayStart)
        equipmentBlocks = (eqBookings ?? [] as EquipmentBlockRow[]).map((eb: EquipmentBlockRow) => {
            const s = new Date(eb.starts_at)
            const e = new Date(eb.ends_at)
            return [s.getUTCHours() * 60 + s.getUTCMinutes(), e.getUTCHours() * 60 + e.getUTCMinutes()]
        })
    }

    // Pobierz godziny otwarcia salonu
    const { data: settings } = await supabase
        .from('salon_settings')
        .select('operating_hours')
        .eq('salon_id', salonId)
        .maybeSingle()

    const operatingHours = (settings?.operating_hours ?? null) as Record<string, DayHours> | null
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
    const dayName = DAY_NAMES[dayOfWeek]
    const dayHours: DayHours = operatingHours?.[dayName] ?? { open: '09:00', close: '17:00', closed: false }

    if (dayHours.closed) {
        return NextResponse.json({ date, serviceId, slots: [] })
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

    // --- Tryb z konkretnym pracownikiem ---
    if (employeeId) {
        const [{ data: schedules }, { data: exceptions }] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('day_of_week, is_working, start_time, end_time')
                .eq('employee_id', employeeId),
            supabase
                .from('employee_schedule_exceptions')
                .select('exception_date, is_working, start_time, end_time')
                .eq('employee_id', employeeId)
                .eq('exception_date', date),
        ])

        const window = resolveEmployeeWindow(
            dayOfWeek,
            date,
            (schedules ?? []) as EmployeeScheduleRow[],
            (exceptions ?? []) as EmployeeExceptionRow[]
        )

        if (!window) return NextResponse.json({ date, serviceId, slots: [] })

        const [empStart, empEnd] = window
        const effectiveStart = Math.max(salonOpen, empStart)
        const effectiveEnd = Math.min(salonClose, empEnd)

        if (effectiveStart >= effectiveEnd) {
            return NextResponse.json({ date, serviceId, slots: [] })
        }

        const slots = generateSlots(effectiveStart, effectiveEnd, service.duration, bookingRows, employeeId, equipmentBlocks)
        return NextResponse.json({ date, serviceId, slots })
    }

    // --- Tryb bez konkretnego pracownika: unia slotów wszystkich dostępnych pracowników ---
    const { data: employees } = await supabase
        .from('employees')
        .select('id')
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)

    if (!employees || employees.length === 0) {
        return NextResponse.json({ date, serviceId, slots: [] })
    }

    const empIds = (employees as { id: string }[]).map(e => e.id)

    const [{ data: allSchedules }, { data: allExceptions }] = await Promise.all([
        supabase
            .from('employee_schedules')
            .select('employee_id, day_of_week, is_working, start_time, end_time')
            .in('employee_id', empIds),
        supabase
            .from('employee_schedule_exceptions')
            .select('employee_id, exception_date, is_working, start_time, end_time')
            .in('employee_id', empIds)
            .eq('exception_date', date),
    ])

    const schedulesByEmp = new Map<string, EmployeeScheduleRow[]>()
    const exceptionsByEmp = new Map<string, EmployeeExceptionRow[]>()

    for (const row of (allSchedules ?? []) as (EmployeeScheduleRow & { employee_id: string })[]) {
        if (!schedulesByEmp.has(row.employee_id)) schedulesByEmp.set(row.employee_id, [])
        schedulesByEmp.get(row.employee_id)!.push(row)
    }
    for (const row of (allExceptions ?? []) as (EmployeeExceptionRow & { employee_id: string })[]) {
        if (!exceptionsByEmp.has(row.employee_id)) exceptionsByEmp.set(row.employee_id, [])
        exceptionsByEmp.get(row.employee_id)!.push(row)
    }

    const slotsSet = new Set<string>()

    for (const empId of empIds) {
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
        const empSlots = generateSlots(effectiveStart, effectiveEnd, service.duration, empBookings, empId, equipmentBlocks)
        for (const s of empSlots) slotsSet.add(s)
    }

    const slots = Array.from(slotsSet).sort()
    return NextResponse.json({ date, serviceId, slots })
}
