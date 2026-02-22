import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createPrzelewy24Client, Przelewy24Error } from '@/lib/payments/przelewy24-client'
import { createSubscriptionManager } from '@/lib/payments/subscription-manager'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Przelewy24 Webhook Handler
 *
 * Endpoint odbierający notyfikacje o płatnościach z Przelewy24
 * POST /api/webhooks/przelewy24
 *
 * Dokumentacja: https://docs.przelewy24.pl/article/25
 */

interface P24NotificationPayload {
  merchantId: number
  posId: number
  sessionId: string
  amount: number
  originAmount: number
  currency: string
  orderId: number
  methodId: number
  statement: string
  sign: string
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Parse request body
    const payload: P24NotificationPayload = await request.json()

    console.log('[P24 WEBHOOK] Received notification:', {
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
      timestamp: new Date().toISOString(),
    })

    // Waliduj wymagane pola
    if (
      !payload.merchantId ||
      !payload.posId ||
      !payload.sessionId ||
      !payload.orderId ||
      !payload.sign
    ) {
      console.error('[P24 WEBHOOK] Missing required fields:', payload)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Inicjalizuj klienty
    const p24 = createPrzelewy24Client()
    const subManager = createSubscriptionManager()
    const supabase = createAdminSupabaseClient()

    // 1. Weryfikuj sygnaturę
    const signatureValid = p24.verifyNotificationSignature(payload)

    if (!signatureValid) {
      console.error('[P24 WEBHOOK] Invalid signature:', {
        sessionId: payload.sessionId,
        receivedSign: payload.sign,
      })

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    console.log('[P24 WEBHOOK] Signature verified ✓')

    // 2. Weryfikuj transakcję w P24 API (double-check)
    const verificationResult = await p24.verifyTransaction({
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    })

    if (!verificationResult) {
      console.error('[P24 WEBHOOK] Transaction verification failed:', {
        sessionId: payload.sessionId,
        orderId: payload.orderId,
      })

      return NextResponse.json(
        { error: 'Transaction verification failed' },
        { status: 400 }
      )
    }

    console.log('[P24 WEBHOOK] Transaction verified ✓')

    // 3. Znajdź powiązaną subskrypcję
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, salons(id, slug, owner_email, billing_email)')
      .eq('p24_transaction_id', payload.sessionId)
      .single()

    if (subError || !subscription) {
      console.error('[P24 WEBHOOK] Subscription not found:', {
        sessionId: payload.sessionId,
        error: subError,
      })

      // Może to być płatność upgrade/downgrade - sprawdź invoices
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*, salons(id, slug, owner_email, billing_email)')
        .eq('p24_transaction_id', payload.sessionId)
        .single()

      if (invoice) {
        // Oznacz fakturę jako zapłaconą
        await supabase
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            p24_order_id: payload.orderId.toString(),
          })
          .eq('id', invoice.id)

        console.log('[P24 WEBHOOK] Invoice marked as paid:', invoice.id)

        return NextResponse.json({ status: 'OK' }, { status: 200 })
      }

      return NextResponse.json(
        { error: 'Subscription or invoice not found' },
        { status: 404 }
      )
    }

    const salon = subscription.salons

    // 4. Obsłuż sukces płatności
    await subManager.handlePaymentSuccess({
      salonId: salon.id,
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
    })

    console.log('[P24 WEBHOOK] Payment success handled ✓', {
      salonId: salon.id,
      salonSlug: salon.slug,
      subscriptionId: subscription.id,
      amount: payload.amount,
      duration: Date.now() - startTime,
    })

    // 5. TODO: Wyślij email z potwierdzeniem płatności
    // await sendEmail({
    //   to: salon.billing_email || salon.owner_email,
    //   template: 'payment-successful',
    //   data: {
    //     salonName: salon.name,
    //     amount: payload.amount / 100,
    //     orderId: payload.orderId,
    //     invoiceUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${salon.slug}/billing/invoices/${invoice.id}`,
    //   },
    // })

    return NextResponse.json({ status: 'OK' }, { status: 200 })
  } catch (error) {
    console.error('[P24 WEBHOOK] Error:', error)

    // Loguj error do Sentry (jeśli skonfigurowany)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error)
    }

    if (error instanceof Przelewy24Error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Obsługa OPTIONS (CORS preflight)
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
