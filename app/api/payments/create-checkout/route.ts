import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSubscriptionManager, BillingInterval, PlanType } from '@/lib/payments/subscription-manager'

/**
 * Create Checkout Session
 *
 * POST /api/payments/create-checkout
 *
 * Tworzy nową sesję checkout dla wybranego planu
 */

interface CreateCheckoutRequest {
  planType: PlanType
  billingInterval: BillingInterval
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: CreateCheckoutRequest = await request.json()

    const { planType, billingInterval } = body

    // Walidacja
    if (!planType || !billingInterval) {
      return NextResponse.json(
        { error: 'Missing planType or billingInterval' },
        { status: 400 }
      )
    }

    if (!['starter', 'professional', 'business', 'enterprise'].includes(planType)) {
      return NextResponse.json({ error: 'Invalid planType' }, { status: 400 })
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return NextResponse.json({ error: 'Invalid billingInterval' }, { status: 400 })
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

    if (typedProfile.role !== 'owner') {
      return NextResponse.json({ error: 'Only salon owner can manage subscriptions' }, { status: 403 })
    }

    const salonId = typedProfile.salon_id

    // Utwórz checkout session
    const subManager = createSubscriptionManager()

    const result = await subManager.createSubscription({
      salonId,
      planType,
      billingInterval,
    })

    console.log('[CREATE CHECKOUT] Session created:', {
      salonId,
      planType,
      billingInterval,
      subscriptionId: result.subscriptionId,
      requiresPayment: result.requiresPayment,
    })

    return NextResponse.json({
      success: true,
      subscriptionId: result.subscriptionId,
      requiresPayment: result.requiresPayment,
      paymentUrl: result.paymentUrl,
    })
  } catch (error) {
    console.error('[CREATE CHECKOUT] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
