import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const postSchema = z.object({
    exception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    is_working: z.boolean(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
    reason: z.string().max(255).nullable().optional(),
})

async function resolveContext(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, employeeId: string) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Unauthorized', status: 401, salonId: null, role: null }

    const { data: profile } = await supabase
        .from('profiles')
        .select('salon_id, role')
        .eq('user_id', user.id)
        .single()
    if (!profile) return { error: 'Profile not found', status: 404, salonId: null, role: null }

    const p = profile as { salon_id: string; role: string }

    const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('id', employeeId)
        .eq('salon_id', p.salon_id)
        .is('deleted_at', null)
        .single()
    if (!emp) return { error: 'Employee not found', status: 404, salonId: null, role: null }

    return { error: null, status: 200, salonId: p.salon_id, role: p.role }
}

// GET /api/employees/[id]/schedule/exceptions?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id: employeeId } = await params
    try {
        const supabase = await createServerSupabaseClient()
        const ctx = await resolveContext(supabase, employeeId)
        if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

        const sp = req.nextUrl.searchParams
        const from = sp.get('from') ?? new Date().toISOString().split('T')[0]
        const to = sp.get('to')

        let query = supabase
            .from('employee_schedule_exceptions')
            .select('id, exception_date, is_working, start_time, end_time, reason')
            .eq('employee_id', employeeId)
            .gte('exception_date', from)
            .order('exception_date')

        if (to) query = query.lte('exception_date', to)

        const { data, error } = await query
        if (error) throw error

        return NextResponse.json({ exceptions: data ?? [] })
    } catch (err: unknown) {
        console.error('[exceptions] GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/employees/[id]/schedule/exceptions
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id: employeeId } = await params
    try {
        const supabase = await createServerSupabaseClient()
        const ctx = await resolveContext(supabase, employeeId)
        if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
        if (!['owner', 'manager'].includes(ctx.role ?? '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await req.json()
        const parsed = postSchema.safeParse(body)
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

        const d = parsed.data
        const { data, error } = await supabase
            .from('employee_schedule_exceptions')
            .upsert({
                employee_id: employeeId,
                salon_id: ctx.salonId!,
                exception_date: d.exception_date,
                is_working: d.is_working,
                start_time: d.is_working ? (d.start_time ?? null) : null,
                end_time: d.is_working ? (d.end_time ?? null) : null,
                reason: d.reason ?? null,
            }, { onConflict: 'employee_id,exception_date' })
            .select()
            .single()

        if (error) throw error
        return NextResponse.json({ exception: data }, { status: 201 })
    } catch (err: unknown) {
        console.error('[exceptions] POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/employees/[id]/schedule/exceptions?date=YYYY-MM-DD
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id: employeeId } = await params
    try {
        const supabase = await createServerSupabaseClient()
        const ctx = await resolveContext(supabase, employeeId)
        if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
        if (!['owner', 'manager'].includes(ctx.role ?? '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const date = req.nextUrl.searchParams.get('date')
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: 'date query param required (YYYY-MM-DD)' }, { status: 400 })
        }

        const { error } = await supabase
            .from('employee_schedule_exceptions')
            .delete()
            .eq('employee_id', employeeId)
            .eq('exception_date', date)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (err: unknown) {
        console.error('[exceptions] DELETE error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
