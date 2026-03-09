import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/middleware/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const rl = await applyRateLimit(req, { limit: 20 })
        if (rl) return rl

        const supabase = await createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const from = searchParams.get('from')
        const to = searchParams.get('to')

        if (!from || !to) {
            return NextResponse.json({ error: 'Missing from or to parameters' }, { status: 400 })
        }

        const startDate = new Date(from).toISOString()
        const endDate = new Date(to + 'T23:59:59.999Z').toISOString()

        const { data: salonId } = await supabase.rpc('get_user_salon_id')

        if (!salonId) {
            return NextResponse.json({ error: 'No salon found' }, { status: 404 })
        }

        const { data: bData, error: bError } = await supabase
            .from('bookings')
            .select(`
        id,
        total_price,
        base_price,
        surcharge,
        employee_id,
        employees (
          first_name,
          last_name,
          commission_rate
        )
      `)
            .eq('salon_id', salonId)
            .eq('status', 'completed')
            .gte('booking_date', startDate)
            .lte('booking_date', endDate)

        if (bError) {
            return NextResponse.json({ error: 'Failed retrieving bookings', details: bError }, { status: 500 })
        }

        const stats: Record<string, {
            employee_id: string
            employee_name: string
            bookings_count: number
            revenue: number
            commission_earned: number
        }> = {}

        bData?.forEach(b => {
            const eId = b.employee_id
            if (!eId) return

            const emp = b.employees as { first_name: string; last_name: string; commission_rate: number } | null
            if (!emp) return

            if (!stats[eId]) {
                stats[eId] = {
                    employee_id: eId,
                    employee_name: `${emp.first_name} ${emp.last_name}`,
                    bookings_count: 0,
                    revenue: 0,
                    commission_earned: 0,
                }
            }

            stats[eId].bookings_count += 1
            const priceValue = Number(b.total_price ?? ((b.base_price || 0) + (b.surcharge || 0))) || 0
            stats[eId].revenue += priceValue
            stats[eId].commission_earned += (priceValue * (Number(emp.commission_rate) || 0) / 100)
        })

        const arr = Object.values(stats).sort((a, b) => b.revenue - a.revenue)
        return NextResponse.json({ data: arr })
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
