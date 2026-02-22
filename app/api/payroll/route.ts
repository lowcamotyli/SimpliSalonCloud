import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { payrollMonthSchema } from '@/lib/validators/payroll.validators'
import { canGeneratePayroll, canViewPayroll } from '@/lib/payroll/access'
import { parsePayrollMonth } from '@/lib/payroll/period'

async function buildPayrollData(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  salonId: string,
  monthInput: string
) {
  const { month, periodStart, periodEnd } = parsePayrollMonth(monthInput)

  // Fetch completed bookings for the month with details
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_date,
      total_price,
      employee_id,
      client_id,
      client:clients (
        full_name
      ),
      service:services (
        name
      ),
      employee:employees (
        id,
        employee_code,
        first_name,
        last_name,
        base_threshold,
        base_salary,
        commission_rate
      )
    `)
    .eq('salon_id', salonId)
    .eq('status', 'completed')
    .gte('booking_date', format(periodStart, 'yyyy-MM-dd'))
    .lte('booking_date', format(periodEnd, 'yyyy-MM-dd'))
    .order('booking_date', { ascending: true })

  if (bookingsError) throw bookingsError

  // Group by employee
  const employeeData: Record<string, any> = {}

  bookings?.forEach((booking: any) => {
    const empId = booking.employee_id
    const serviceName = booking.service?.name || 'Usługa'
    const clientName = booking.client?.full_name || 'Klient'

    if (!employeeData[empId]) {
      employeeData[empId] = {
        employee: booking.employee,
        visits: [],
        totalRevenue: 0,
      }
    }

    employeeData[empId].visits.push({
      id: booking.id,
      date: booking.booking_date,
      price: booking.total_price,
      serviceName,
      clientName
    })
    employeeData[empId].totalRevenue += booking.total_price
  })

  // Calculate payroll for each employee
  const payrollEntries = Object.values(employeeData).map((data) => {
    const emp = data.employee
    const totalRevenue = data.totalRevenue
    const visitCount = data.visits.length

    const baseThreshold = emp.base_threshold || 0
    const baseSalary = emp.base_salary || 0
    const commissionRate = emp.commission_rate || 0

    const excess = Math.max(0, totalRevenue - baseThreshold)
    const commissionAmount = excess * commissionRate
    const totalPayout = baseSalary + commissionAmount

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      employeeName: `${emp.first_name} ${emp.last_name || ''}`.trim(),
      visitCount,
      totalRevenue,
      baseThreshold,
      baseSalary,
      commissionRate,
      commissionAmount,
      totalPayout,
      visits: data.visits,
    }
  })

  return {
    period: month,
    periodStart: format(periodStart, 'yyyy-MM-dd'),
    periodEnd: format(periodEnd, 'yyyy-MM-dd'),
    entries: payrollEntries,
    totalRevenue: payrollEntries.reduce((sum, e) => sum + e.totalRevenue, 0),
    totalPayroll: payrollEntries.reduce((sum, e) => sum + e.totalPayout, 0),
  }
}

// GET /api/payroll?month=YYYY-MM
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id, role, salons!profiles_salon_id_fkey(id)')
      .eq('user_id', user.id)
      .single() as any

    if (!profile || !canViewPayroll(profile.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM')
    const payrollData = await buildPayrollData(supabase, profile.salon_id, monthParam)
    return NextResponse.json(payrollData)
  } catch (error: any) {
    console.error('GET /api/payroll error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/payroll - Generate and save payroll
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id, role, salons!profiles_salon_id_fkey(id)')
      .eq('user_id', user.id)
      .single() as any

    if (!profile || !canGeneratePayroll(profile.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json()
    const month = payrollMonthSchema.parse(body?.month)
    const payrollData = await buildPayrollData(supabase, profile.salon_id, month)

    if (!payrollData.entries || payrollData.entries.length === 0) {
      return NextResponse.json(
        { error: 'No completed bookings for this period' },
        { status: 400 }
      )
    }

    // Create payroll run
    const { data: payrollRun, error: runError } = await (supabase
      .from('payroll_runs') as any)
      .insert({
        salon_id: profile.salon_id,
        period_start: payrollData.periodStart,
        period_end: payrollData.periodEnd,
        period_month: month,
        total_revenue: payrollData.totalRevenue,
        total_payroll: payrollData.totalPayroll,
        status: 'draft',
        generated_by: user.id,
      })
      .select()
      .single() as any

    if (runError) throw runError

    // Create payroll entries
    // Note: total_payout is a GENERATED column, so we don't insert it
    const entries = payrollData.entries.map((entry: any) => ({
      payroll_run_id: payrollRun.id,
      employee_id: entry.employeeId,
      visit_count: entry.visitCount,
      total_revenue: entry.totalRevenue,
      base_threshold: entry.baseThreshold,
      base_salary: entry.baseSalary,
      commission_rate: entry.commissionRate,
      commission_amount: entry.commissionAmount,
      // total_payout is auto-calculated: base_salary + commission_amount
    }))

    const { error: entriesError } = await (supabase
      .from('payroll_entries') as any)
      .insert(entries)

    if (entriesError) throw entriesError

    // Send summary to owner
    const { data: settings } = await supabase
      .from('salon_settings')
      .select('contact_email, accounting_email')
      .eq('salon_id', profile.salon_id)
      .maybeSingle() as any

    const targetEmail = settings?.accounting_email || settings?.contact_email

    if (targetEmail) {
      console.log(`[MOCK EMAIL] Auto-sending payroll summary to owner at ${targetEmail} for period ${month}. Total: ${payrollData.totalPayroll} zł`)
    }

    return NextResponse.json({
      payrollRun,
      entriesCount: entries.length,
      ownerEmailSent: !!targetEmail
    }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/payroll error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
