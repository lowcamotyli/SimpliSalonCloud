import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const daySchema = z.object({
    day_of_week: z.number().int().min(0).max(6),
    is_working: z.boolean(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
})

const putSchema = z.object({
    schedule: z.array(daySchema).min(1).max(7),
})

async function getEmployeeSalonId(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
    employeeId: string,
    userSalonId: string
): Promise<boolean> {
    const { data } = await supabase
        .from('employees')
        .select('salon_id')
        .eq('id', employeeId)
        .eq('salon_id', userSalonId)
        .is('deleted_at', null)
        .single()
    return !!data
}

// GET /api/employees/[id]/schedule
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id: employeeId } = await params
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('salon_id')
            .eq('user_id', user.id)
            .single()
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const salonId = (profile as { salon_id: string }).salon_id

        const belongs = await getEmployeeSalonId(supabase, employeeId, salonId)
        if (!belongs) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

        const { data: schedule, error: schedErr } = await supabase
            .from('employee_schedules')
            .select('id, day_of_week, is_working, start_time, end_time')
            .eq('employee_id', employeeId)
            .order('day_of_week')

        if (schedErr) throw schedErr

        const today = new Date().toISOString().split('T')[0]
        const { data: exceptions, error: excErr } = await supabase
            .from('employee_schedule_exceptions')
            .select('id, exception_date, is_working, start_time, end_time, reason')
            .eq('employee_id', employeeId)
            .gte('exception_date', today)
            .order('exception_date')

        if (excErr) throw excErr

        return NextResponse.json({ schedule: schedule ?? [], exceptions: exceptions ?? [] })
    } catch (err: unknown) {
        console.error('[schedule] GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT /api/employees/[id]/schedule — upsert całego grafiku tygodniowego
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id: employeeId } = await params
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('salon_id, role')
            .eq('user_id', user.id)
            .single()
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        const p = profile as { salon_id: string; role: string }
        if (!['owner', 'manager'].includes(p.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const belongs = await getEmployeeSalonId(supabase, employeeId, p.salon_id)
        if (!belongs) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

        const body = await req.json()
        const parsed = putSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
        }

        const rows = parsed.data.schedule.map((d) => ({
            employee_id: employeeId,
            salon_id: p.salon_id,
            day_of_week: d.day_of_week,
            is_working: d.is_working,
            start_time: d.is_working ? (d.start_time ?? null) : null,
            end_time: d.is_working ? (d.end_time ?? null) : null,
        }))

        const { data, error } = await supabase
            .from('employee_schedules')
            .upsert(rows, { onConflict: 'employee_id,day_of_week' })
            .select()

        if (error) throw error

        return NextResponse.json({ schedule: data })
    } catch (err: unknown) {
        console.error('[schedule] PUT error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
