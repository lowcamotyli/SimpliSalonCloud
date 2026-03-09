import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile?.salon_id) {
      return NextResponse.json({ error: 'User not associated with salon' }, { status: 400 })
    }

    if (profile.role !== 'owner') {
      return NextResponse.json({ error: 'Only salon owner can cancel subscription' }, { status: 403 })
    }

    const salonId = profile.salon_id
    const admin = createAdminSupabaseClient()

    const { error: updateError } = await admin
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('salon_id', salonId)
      .in('status', ['active', 'trialing', 'past_due'])

    if (updateError) {
      throw new Error(`Failed to cancel subscription: ${updateError.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription canceled. Access continues until end of billing period.',
    })
  } catch (error) {
    logger.error('billing.cancel failed', error, { endpoint: 'POST /api/billing/cancel' })

    return NextResponse.json(
      {
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
