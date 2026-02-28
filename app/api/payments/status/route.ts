import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

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

    const supabase = createAdminSupabaseClient()

    // Szukaj subskrypcji po P24 transaction ID
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_type, amount_cents, salon_id')
      .eq('p24_transaction_id', sessionId)
      .single()

    if (subscription) {
      return NextResponse.json({
        status: subscription.status === 'active' ? 'paid' : 'pending',
        planType: subscription.plan_type,
        amount: subscription.amount_cents,
      })
    }

    // Sprawdź faktury (dla płatności upgrade)
    const { data: invoice } = await supabase
      .from('invoices')
      .select('status, total_cents')
      .eq('p24_transaction_id', sessionId)
      .single()

    if (invoice) {
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
