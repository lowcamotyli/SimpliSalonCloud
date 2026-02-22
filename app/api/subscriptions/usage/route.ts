import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUsageReport } from '@/lib/middleware/usage-limiter'

/**
 * Get Usage Report
 *
 * GET /api/subscriptions/usage
 *
 * Zwraca raport użycia dla salonu (limity, obecne usage, etc.)
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Pobierz salon ID użytkownika
    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    const typedProfile = profile as any
    if (!typedProfile?.salon_id) {
      return NextResponse.json({ error: 'User not associated with salon' }, { status: 400 })
    }

    const salonId = typedProfile.salon_id

    // Pobierz raport użycia
    const report = await getUsageReport(salonId)

    return NextResponse.json({
      success: true,
      ...report,
    })
  } catch (error) {
    console.error('[USAGE REPORT] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to get usage report',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
