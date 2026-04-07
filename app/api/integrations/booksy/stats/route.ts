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
    const {
      data: { user },
    } = await supabase.auth.getUser()

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

    const { data: settings } = await admin
      .from('salon_settings')
      .select('booksy_last_sync_at, booksy_sync_stats, updated_at')
      .eq('salon_id', profile.salon_id)
      .single()

    const { data: latestSyncLog } = await admin
      .from('booksy_sync_logs')
      .select('sync_results, finished_at, started_at')
      .eq('salon_id', profile.salon_id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestSyncResults = Array.isArray(latestSyncLog?.sync_results) ? (latestSyncLog.sync_results as any[]) : []
    const hasReauthError = latestSyncResults.some(entry => entry?.code === 'GMAIL_REAUTH_REQUIRED')
    // If tokens were updated after the last error log, the user already reconnected — do not show warning
    const tokenRefreshedAfterError =
      hasReauthError &&
      settings?.updated_at != null &&
      latestSyncLog?.started_at != null &&
      new Date(settings.updated_at) > new Date(latestSyncLog.started_at)
    const requiresReauth = hasReauthError && !tokenRefreshedAfterError

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
      connectionStatus: requiresReauth ? 'reauth_required' : 'connected',
      connectionMessage: requiresReauth
        ? 'Sesja Gmail wygasla. Polacz konto ponownie, aby wznowic synchronizacje.'
        : null,
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
