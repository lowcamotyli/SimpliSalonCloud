import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { payrollMonthSchema } from '@/lib/validators/payroll.validators'
import { canGeneratePayroll, canViewPayroll } from '@/lib/payroll/access'
import {
  getPeriodRange,
  parsePayrollMonth,
  type PayrollPeriodType,
} from '@/lib/payroll/period'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'

async function buildPayrollData(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  salonId: string,
  options: {
    period: string
    periodStart: Date
    periodEnd: Date
  }
) {
  const { period, periodStart, periodEnd } = options

  // Fetch completed bookings for the requested period with details
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
    period,
    periodStart: format(periodStart, 'yyyy-MM-dd'),
    periodEnd: format(periodEnd, 'yyyy-MM-dd'),
    entries: payrollEntries,
    totalRevenue: payrollEntries.reduce((sum, e) => sum + e.totalRevenue, 0),
    totalPayroll: payrollEntries.reduce((sum, e) => sum + e.totalPayout, 0),
  }
}

function resolvePayrollPeriod(searchParams: URLSearchParams): {
  period: string
  periodStart: Date
  periodEnd: Date
} {
  const typeParam = searchParams.get('type')
  const periodParam = searchParams.get('period')
  const monthParam = searchParams.get('month')

  if (typeParam) {
    if (!['daily', 'weekly', 'monthly'].includes(typeParam)) {
      throw new Error('Invalid type value (expected daily, weekly, or monthly)')
    }

    const type = typeParam as PayrollPeriodType

    if (!periodParam) {
      throw new Error('period is required when type is provided')
    }

    const { periodStart, periodEnd } = getPeriodRange(periodParam, type)

    return {
      period: periodParam,
      periodStart,
      periodEnd,
    }
  }

  if (monthParam) {
    const { month, periodStart, periodEnd } = parsePayrollMonth(monthParam)

    return {
      period: month,
      periodStart,
      periodEnd,
    }
  }

  const { month, periodStart, periodEnd } = parsePayrollMonth(format(new Date(), 'yyyy-MM'))

  return {
    period: month,
    periodStart,
    periodEnd,
  }
}

// GET /api/payroll?month=YYYY-MM
export async function GET(request: NextRequest) {
  try {
    const rl = await applyRateLimit(request, { limit: 20 })
    if (rl) return rl

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
    const payrollPeriod = resolvePayrollPeriod(searchParams)
    const payrollData = await buildPayrollData(supabase, profile.salon_id, payrollPeriod)
    return NextResponse.json(payrollData)
  } catch (error: any) {
    logger.error('GET /api/payroll failed', error, { endpoint: 'GET /api/payroll' })
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
    const { periodStart, periodEnd } = parsePayrollMonth(month)
    const payrollData = await buildPayrollData(supabase, profile.salon_id, {
      period: month,
      periodStart,
      periodEnd,
    })

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
    logger.error('POST /api/payroll failed', error, { endpoint: 'POST /api/payroll' })

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
