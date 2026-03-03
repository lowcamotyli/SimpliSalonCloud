import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Payment Status Check
 *
 * GET /api/payments/status?session=SESSION_ID
 *
 * Sprawdza status płatności dla danego sessionId Przelewy24.
 * Wywoływany przez stronę success po powrocie z P24.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session parameter' }, { status: 400 })
    }

    const serverSupabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminSupabaseClient()

    const hasSalonAccess = async (salonId: string) => {
      const { data: membership, error: membershipError } = await (serverSupabase as any)
        .from('profiles')
        .select('salon_id')
        .eq('user_id', user.id)
        .eq('salon_id', salonId)
        .maybeSingle()

      if (membershipError) {
        throw membershipError
      }

      return !!membership
    }

    // Szukaj subskrypcji po P24 transaction ID
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_type, amount_cents, salon_id, metadata, p24_order_id')
      .eq('p24_transaction_id', sessionId)
      .maybeSingle()

    if (subscription) {
      const allowed = await hasSalonAccess(subscription.salon_id)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const isPendingUpgrade = !!(subscription.metadata as any)?.pending_plan_change
      const isPaid = subscription.status === 'active' && !!subscription.p24_order_id && !isPendingUpgrade

      return NextResponse.json({
        status: isPaid ? 'paid' : 'pending',
        planType: subscription.plan_type,
        amount: subscription.amount_cents,
      })
    }

    // Sprawdź faktury (dla płatności upgrade)
    const { data: invoice } = await supabase
      .from('invoices')
      .select('status, total_cents, salon_id')
      .eq('p24_transaction_id', sessionId)
      .maybeSingle()

    if (invoice) {
      const allowed = await hasSalonAccess(invoice.salon_id)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return NextResponse.json({
        status: invoice.status === 'paid' ? 'paid' : 'pending',
        amount: invoice.total_cents,
      })
    }

    // Brak rekordu – transakcja jeszcze nie przetworzona przez webhook
    return NextResponse.json({ status: 'pending' })
  } catch (error) {
    console.error('[PAYMENT STATUS] Error:', error)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
