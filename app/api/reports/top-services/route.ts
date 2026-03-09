import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/middleware/rate-limit'

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

type ServiceAggregate = {
  service_name: string
  booking_count: number
  total_revenue: number
  rating_sum: number
  rating_count: number
}

export async function GET(request: NextRequest) {
  try {
    const rl = await applyRateLimit(request, { limit: 20 })
    if (rl) return rl

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

    const { data: bookings, error: bookingsError } = await (supabase as any)
      .from('bookings')
      .select('id, service_id, total_price, base_price, surcharge, service:services(id, name), surveys:satisfaction_surveys(rating)')
      .eq('salon_id', salonId)
      .eq('status', 'completed')
      .gte('booking_date', from)
      .lte('booking_date', to)

    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 })
    }

    const grouped = new Map<string, ServiceAggregate>()

    for (const booking of (bookings as any[]) ?? []) {
      const service = Array.isArray(booking.service) ? booking.service[0] : booking.service

      const serviceId = booking.service_id
      const serviceName = service?.name ?? 'Unknown service'
      const key = `${serviceId}:${serviceName}`

      const current = grouped.get(key) ?? {
        service_name: serviceName,
        booking_count: 0,
        total_revenue: 0,
        rating_sum: 0,
        rating_count: 0,
      }

      current.booking_count += 1
      current.total_revenue += bookingRevenue(booking)

      for (const survey of booking.surveys ?? []) {
        const rating = Number(survey.rating)
        if (!Number.isFinite(rating)) continue
        current.rating_sum += rating
        current.rating_count += 1
      }

      grouped.set(key, current)
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        service_name: item.service_name,
        booking_count: item.booking_count,
        total_revenue: Number(item.total_revenue.toFixed(2)),
        avg_rating: item.rating_count > 0
          ? Number((item.rating_sum / item.rating_count).toFixed(1))
          : null,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10)

    return NextResponse.json({ rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch top services report' },
      { status: 400 }
    )
  }
}
