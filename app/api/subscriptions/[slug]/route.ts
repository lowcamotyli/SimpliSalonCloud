import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Get Subscription Details
 *
 * GET /api/subscriptions/[slug]
 *
 * Zwraca szczegóły subskrypcji dla salonu
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const slug = params.slug
    const adminSupabase = createAdminSupabaseClient()

    // Pobierz salon
    const { data: salon, error: salonError } = await adminSupabase
      .from('salons')
      .select('*')
      .eq('slug', slug)
      .single()

    if (salonError || !salon) {
      return NextResponse.json({ error: 'Salon not found' }, { status: 404 })
    }

    // Sprawdź czy user ma dostęp do tego salonu
    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile || (profile as any).salon_id !== salon.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Pobierz aktywną subskrypcję
    const { data: subscription } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Pobierz domyślną metodę płatności
    const { data: paymentMethod } = await adminSupabase
      .from('payment_methods')
      .select('*')
      .eq('salon_id', salon.id)
      .eq('is_default', true)
      .eq('is_active', true)
      .single()

    return NextResponse.json({
      success: true,
      plan: salon.subscription_plan || 'starter',
      status: salon.subscription_status || 'trialing',
      trialEndsAt: salon.trial_ends_at,
      currentPeriodEnd: subscription?.current_period_end,
      amount: subscription?.amount_cents,
      billingInterval: subscription?.billing_interval || 'monthly',
      paymentMethod: paymentMethod
        ? {
            type: paymentMethod.type,
            brand: paymentMethod.card_brand,
            last4: paymentMethod.card_last4,
          }
        : null,
    })
  } catch (error) {
    console.error('[SUBSCRIPTION] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to fetch subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
