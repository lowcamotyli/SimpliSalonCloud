import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/integrations/booksy/stats
 * Returns Booksy integration stats for the current user's salon
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

        // Get settings stats
        const { data: settings } = await admin
            .from('salon_settings')
            .select('booksy_last_sync_at, booksy_sync_stats')
            .eq('salon_id', profile.salon_id)
            .single()

        // Count bookings from Booksy
        const { count: totalBookings } = await admin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', profile.salon_id)
            .eq('source', 'booksy')

        const { count: cancelledBookings } = await admin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', profile.salon_id)
            .eq('source', 'booksy')
            .eq('status', 'cancelled')

        const { count: scheduledBookings } = await admin
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', profile.salon_id)
            .eq('source', 'booksy')
            .eq('status', 'scheduled')

        return NextResponse.json({
            lastSyncAt: settings?.booksy_last_sync_at ?? null,
            syncStats: settings?.booksy_sync_stats ?? { total: 0, success: 0, errors: 0 },
            bookings: {
                total: totalBookings ?? 0,
                scheduled: scheduledBookings ?? 0,
                cancelled: cancelledBookings ?? 0,
            },
        })
    } catch (error: any) {
        console.error('Booksy stats error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
