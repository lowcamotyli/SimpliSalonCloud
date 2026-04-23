import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkProtectedApiRateLimit } from '@/lib/middleware/rate-limit'

function parseDate(value: string | null): Date | null {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateStringUtc(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateRange(searchParams: URLSearchParams) {
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const fromInput = searchParams.get('from')
  const toInput = searchParams.get('to')

  const parsedFrom = parseDate(fromInput)
  const parsedTo = parseDate(toInput)

  if (fromInput && !parsedFrom) {
    throw new Error('Invalid from date')
  }

  if (toInput && !parsedTo) {
    throw new Error('Invalid to date')
  }

  const fromDate = parsedFrom ?? defaultFrom
  const toDate = parsedTo ?? now

  if (fromDate > toDate) {
    throw new Error('from date cannot be later than to date')
  }

  return {
    from: toDateStringUtc(fromDate),
    to: toDateStringUtc(toDate),
  }
}

type WorkedBooking = {
  employee_id: string | null
  duration: number | null
}

type EmployeeRow = {
  id: string
  first_name: string | null
  last_name: string | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkProtectedApiRateLimit(`reports:hours-worked:${user.id}`, { limit: 60 })
    if (!rateLimit.success) {
      const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': rateLimit.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimit.reset / 1000).toString(),
          },
        }
      )
    }

    const role = user.app_metadata?.role
    const salonId = user.app_metadata?.salon_id as string | undefined

    if (!salonId || !['owner', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { from, to } = parseDateRange(request.nextUrl.searchParams)
    const rawEmployeeId = request.nextUrl.searchParams.get('employeeId')
    const employeeId = rawEmployeeId?.trim() || null

    if (employeeId && !UUID_REGEX.test(employeeId)) {
      return NextResponse.json({ error: 'Invalid employeeId parameter' }, { status: 400 })
    }

    let bookingsQuery = supabase
      .from('bookings')
      .select('employee_id, duration')
      .eq('salon_id', salonId)
      .eq('status', 'completed')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .is('deleted_at', null)

    if (employeeId) {
      bookingsQuery = bookingsQuery.eq('employee_id', employeeId)
    }

    const [{ data: bookings, error: bookingsError }, { data: employees, error: employeesError }] =
      await Promise.all([
        bookingsQuery,
        supabase
          .from('employees')
          .select('id, first_name, last_name')
          .eq('salon_id', salonId)
          .is('deleted_at', null),
      ])

    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 })
    }

    if (employeesError) {
      return NextResponse.json({ error: employeesError.message }, { status: 500 })
    }

    const employeeNames = new Map<string, string>()
    for (const employee of (employees ?? []) as EmployeeRow[]) {
      const employeeName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
      employeeNames.set(employee.id, employeeName)
    }

    if (employeeId && !employeeNames.has(employeeId)) {
      return NextResponse.json({ error: 'Employee not found in salon scope' }, { status: 400 })
    }

    const grouped = new Map<string, { total_minutes: number; appointments_count: number }>()
    for (const booking of (bookings ?? []) as WorkedBooking[]) {
      if (!booking.employee_id) continue

      const current = grouped.get(booking.employee_id) ?? { total_minutes: 0, appointments_count: 0 }
      current.total_minutes += booking.duration ?? 0
      current.appointments_count += 1
      grouped.set(booking.employee_id, current)
    }

    const rows = Array.from(grouped.entries())
      .map(([employee_id, value]) => ({
        employee_id,
        employee_name: employeeNames.get(employee_id) ?? '',
        total_minutes: value.total_minutes,
        appointments_count: value.appointments_count,
        avg_minutes: Number((value.total_minutes / value.appointments_count).toFixed(1)),
      }))
      .sort((a, b) => b.total_minutes - a.total_minutes)

    return NextResponse.json({ rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch hours worked report' },
      { status: 400 }
    )
  }
}
