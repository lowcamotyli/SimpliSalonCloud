import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/integrations/booksy/logs
 * Returns recent Booksy bookings (last 20) for the current user's salon
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('salon_id')
            .eq('user_id', user.id)
            .single()

        if (!profile?.salon_id) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const admin = createAdminClient()

        const { data: bookings, error } = await admin
            .from('bookings')
            .select(`
        id,
        booking_date,
        booking_time,
        status,
        created_at,
        base_price,
        clients (full_name, phone),
        employees (first_name, last_name),
        services (name)
      `)
            .eq('salon_id', profile.salon_id)
            .eq('source', 'booksy')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) throw error

        return NextResponse.json({ bookings: bookings ?? [] })
    } catch (error: any) {
        console.error('Booksy logs error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
