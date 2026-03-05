import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonId } from '@/lib/utils/salon'

interface ScheduleRow {
    employee_id: string
    day_of_week: number
    is_working: boolean
}

interface ExceptionRow {
    employee_id: string
    exception_date: string
    is_working: boolean
}

/**
 * Sprawdza czy pracownik ma co najmniej jeden dostępny dzień w ciągu najbliższych `lookAheadDays` dni.
 * Pracownik BEZ żadnych wierszy w grafiku jest uznawany za niedostępnego.
 */
function isEmployeeAvailableSoon(
    employeeId: string,
    schedules: ScheduleRow[],
    exceptions: ExceptionRow[],
    lookAheadDays: number
): boolean {
    const empSchedules = schedules.filter(s => s.employee_id === employeeId)
    const empExceptions = exceptions.filter(e => e.employee_id === employeeId)

    // Brak jakiegokolwiek grafiku = niedostępny
    if (empSchedules.length === 0) return false

    const today = new Date()
    for (let i = 0; i < lookAheadDays; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const dow = d.getDay()

        // Sprawdź wyjątek na ten dzień
        const exc = empExceptions.find(e => e.exception_date === dateStr)
        if (exc) {
            if (exc.is_working) return true
            continue
        }

        // Sprawdź stały grafik
        const day = empSchedules.find(s => s.day_of_week === dow)
        if (day?.is_working) return true
    }

    return false
}

export async function GET(request: NextRequest) {
    const authError = validateApiKey(request)
    if (authError) return authError

    const supabase = createAdminSupabaseClient()
    const salonId = getSalonId(request)

    const { data: employees, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('first_name')

    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })
    if (!employees || employees.length === 0) {
        return NextResponse.json({ employees: [] })
    }

    const empIds = (employees as { id: string }[]).map(e => e.id)

    // Pobierz grafiki i wyjątki dla következnych 30 dni
    const today = new Date().toISOString().split('T')[0]
    const future = new Date()
    future.setDate(future.getDate() + 30)
    const futureStr = future.toISOString().split('T')[0]

    const [{ data: schedules }, { data: exceptions }] = await Promise.all([
        supabase
            .from('employee_schedules')
            .select('employee_id, day_of_week, is_working')
            .in('employee_id', empIds),
        supabase
            .from('employee_schedule_exceptions')
            .select('employee_id, exception_date, is_working')
            .in('employee_id', empIds)
            .gte('exception_date', today)
            .lte('exception_date', futureStr),
    ])

    const scheduleRows = (schedules ?? []) as ScheduleRow[]
    const exceptionRows = (exceptions ?? []) as ExceptionRow[]

    const availableEmployees = (employees as { id: string; first_name: string; last_name: string | null }[])
        .filter(emp => isEmployeeAvailableSoon(emp.id, scheduleRows, exceptionRows, 30))

    return NextResponse.json({ employees: availableEmployees })
}
