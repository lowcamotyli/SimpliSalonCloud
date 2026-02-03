import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, format } from 'date-fns'

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

    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM')

    // Parse month
    const [year, month] = monthParam.split('-').map(Number)
    const periodStart = startOfMonth(new Date(year, month - 1))
    const periodEnd = endOfMonth(new Date(year, month - 1))

    // Fetch completed bookings for the month
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        employee_id,
        total_price,
        employees (
          id,
          employee_code,
          first_name,
          last_name,
          base_threshold,
          base_salary,
          commission_rate
        )
      `)
      .eq('salon_id', profile.salon_id)
      .eq('status', 'completed')
      .gte('booking_date', format(periodStart, 'yyyy-MM-dd'))
      .lte('booking_date', format(periodEnd, 'yyyy-MM-dd'))

    if (bookingsError) throw bookingsError

    // Group by employee
    const employeeData: Record<string, any> = {}

    bookings?.forEach((booking: any) => {
      const empId = booking.employee_id

      if (!employeeData[empId]) {
        employeeData[empId] = {
          employee: booking.employees,
          visits: [],
          totalRevenue: 0,
        }
      }

      employeeData[empId].visits.push(booking)
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
      }
    })

    return NextResponse.json({
      period: monthParam,
      periodStart: format(periodStart, 'yyyy-MM-dd'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd'),
      entries: payrollEntries,
      totalRevenue: payrollEntries.reduce((sum, e) => sum + e.totalRevenue, 0),
      totalPayroll: payrollEntries.reduce((sum, e) => sum + e.totalPayout, 0),
    })
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

    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json()
    const { month } = body // YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Invalid month format (expected YYYY-MM)' },
        { status: 400 }
      )
    }

    // Get payroll data (reuse GET logic)
    const getResponse = await GET(request)
    const payrollData = await getResponse.json()

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
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}