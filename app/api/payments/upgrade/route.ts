import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSubscriptionManager, BillingInterval, PlanType } from '@/lib/payments/subscription-manager'

/**
 * Upgrade/Downgrade Subscription
 *
 * POST /api/payments/upgrade
 *
 * Zmienia plan subskrypcji (upgrade lub downgrade)
 */

interface UpgradeRequest {
  newPlanType: PlanType
  billingInterval?: BillingInterval
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: UpgradeRequest = await request.json()

    const { newPlanType, billingInterval } = body

    // Walidacja
    if (!newPlanType) {
      return NextResponse.json({ error: 'Missing newPlanType' }, { status: 400 })
    }

    if (!['starter', 'professional', 'business', 'enterprise'].includes(newPlanType)) {
      return NextResponse.json({ error: 'Invalid newPlanType' }, { status: 400 })
    }

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

    // Tylko owner może zmieniać plan
    if (typedProfile.role !== 'owner') {
      return NextResponse.json({ error: 'Only salon owner can change subscription' }, { status: 403 })
    }

    const salonId = typedProfile.salon_id

    // Upgrade/downgrade subskrypcji
    const subManager = createSubscriptionManager()

    const result = await subManager.upgradeSubscription({
      salonId,
      newPlanType,
      billingInterval,
    })

    console.log('[UPGRADE] Subscription changed:', {
      salonId,
      newPlanType,
      billingInterval,
      requiresPayment: result.requiresPayment,
      proratedAmount: result.proratedAmount,
    })

    return NextResponse.json({
      success: true,
      requiresPayment: result.requiresPayment,
      paymentUrl: result.paymentUrl,
      proratedAmount: result.proratedAmount,
    })
  } catch (error) {
    console.error('[UPGRADE] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to upgrade subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
