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

function bookingRevenue(booking: any): number {
  if (typeof booking.total_price === 'number') return booking.total_price
  if (typeof booking.price === 'number') return booking.price

  const basePrice = typeof booking.base_price === 'number' ? booking.base_price : 0
  const surcharge = typeof booking.surcharge === 'number' ? booking.surcharge : 0
  return basePrice + surcharge
}

type PaymentMethodBooking = {
  payment_method: string | null
  total_price: number | null
  base_price: number | null
  surcharge: number | null
}

const KNOWN_PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'voucher', 'other'])

function normalizePaymentMethod(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!normalized) {
    return 'other'
  }

  return KNOWN_PAYMENT_METHODS.has(normalized) ? normalized : 'other'
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

    const rateLimit = await checkProtectedApiRateLimit(`reports:payment-methods:${user.id}`, { limit: 60 })
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

    const { data, error } = await supabase
      .from('bookings')
      .select('payment_method, total_price, base_price, surcharge')
      .eq('salon_id', salonId)
      .eq('status', 'completed')
      .gte('booking_date', from)
      .lte('booking_date', to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const grouped = new Map<string, { count: number; total_value: number }>()

    for (const booking of (data ?? []) as PaymentMethodBooking[]) {
      const method = normalizePaymentMethod(booking.payment_method)
      const current = grouped.get(method) ?? { count: 0, total_value: 0 }
      current.count += 1
      current.total_value += bookingRevenue(booking)
      grouped.set(method, current)
    }

    const rows = Array.from(grouped.entries())
      .map(([method, value]) => ({
        method,
        count: value.count,
        total_value: Number(value.total_value.toFixed(2)),
      }))
      .sort((a, b) => b.total_value - a.total_value || a.method.localeCompare(b.method))

    const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
    const totalValue = Number(rows.reduce((sum, row) => sum + row.total_value, 0).toFixed(2))

    return NextResponse.json({
      rows,
      total_count: totalCount,
      total_value: totalValue,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch payment methods report' },
      { status: 400 }
    )
  }
}
