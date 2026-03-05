import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

function bookingRevenue(booking: any): number {
  if (typeof booking.total_price === 'number') return booking.total_price
  if (typeof booking.price === 'number') return booking.price

  const basePrice = typeof booking.base_price === 'number' ? booking.base_price : 0
  const surcharge = typeof booking.surcharge === 'number' ? booking.surcharge : 0
  return basePrice + surcharge
}

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

    const role = user.app_metadata?.role
    const salonId = user.app_metadata?.salon_id as string | undefined

    if (!salonId || !['owner', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { from, to } = parseDateRange(request.nextUrl.searchParams)
    const format = request.nextUrl.searchParams.get('format')

    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date, total_price, base_price, surcharge')
      .eq('salon_id', salonId)
      .eq('status', 'completed')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('booking_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const byDate = new Map<string, { booking_count: number; revenue: number }>()

    for (const booking of data ?? []) {
      const dateKey = booking.booking_date
      const current = byDate.get(dateKey) ?? { booking_count: 0, revenue: 0 }
      current.booking_count += 1
      current.revenue += bookingRevenue(booking)
      byDate.set(dateKey, current)
    }

    const rows = Array.from(byDate.entries())
      .map(([booking_date, value]) => ({
        booking_date,
        booking_count: value.booking_count,
        revenue: Number(value.revenue.toFixed(2)),
      }))
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date))

    const totalRevenue = Number(rows.reduce((sum, row) => sum + row.revenue, 0).toFixed(2))

    if (format === 'csv') {
      const lines = ['Data,Liczba wizyt,Przychod']
      for (const row of rows) {
        lines.push(`${row.booking_date},${row.booking_count},${row.revenue.toFixed(2)}`)
      }

      const csv = `\uFEFF${lines.join('\n')}`

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="revenue-report-${from}-to-${to}.csv"`,
        },
      })
    }

    return NextResponse.json({
      rows,
      total_revenue: totalRevenue,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch revenue report' },
      { status: 400 }
    )
  }
}
