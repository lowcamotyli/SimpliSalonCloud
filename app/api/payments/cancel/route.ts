import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSubscriptionManager } from '@/lib/payments/subscription-manager'

/**
 * Cancel Subscription
 *
 * POST /api/payments/cancel
 *
 * Anuluje subskrypcję (na koniec okresu rozliczeniowego lub natychmiast)
 */

interface CancelRequest {
  immediately?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: CancelRequest = await request.json()

    const { immediately = false } = body

    // Pobierz salon ID użytkownika
    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .single()

    const typedProfile = profile as any
    if (!typedProfile?.salon_id) {
      return NextResponse.json({ error: 'User not associated with salon' }, { status: 400 })
    }

    // Tylko owner może anulować subskrypcję
    if (typedProfile.role !== 'owner') {
      return NextResponse.json({ error: 'Only salon owner can cancel subscription' }, { status: 403 })
    }

    const salonId = typedProfile.salon_id

    // Anuluj subskrypcję
    const subManager = createSubscriptionManager()

    await subManager.cancelSubscription(salonId, immediately)

    console.log('[CANCEL] Subscription canceled:', {
      salonId,
      immediately,
    })

    return NextResponse.json({
      success: true,
      message: immediately
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of billing period',
    })
  } catch (error) {
    console.error('[CANCEL] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
