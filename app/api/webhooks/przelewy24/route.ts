import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createPrzelewy24Client, Przelewy24Error } from '@/lib/payments/przelewy24-client'
import { createSubscriptionManager } from '@/lib/payments/subscription-manager'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'

/**
 * Przelewy24 Webhook Handler
 *
 * Endpoint odbierajacy notyfikacje o platnosciach z Przelewy24
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

function resolveMaybeEncryptedSecret(value: string | null): string | null {
  if (!value) return null
  return isEncryptedPayload(value) ? decryptSecret(value) : value
}

async function createP24ClientForSalon(supabase: any, salonId: string) {
  const { data: settings } = await supabase
    .from('salon_settings')
    .select('p24_merchant_id, p24_pos_id, p24_crc, p24_api_key, p24_api_url')
    .eq('salon_id', salonId)
    .maybeSingle()

  const merchantId = settings?.p24_merchant_id?.trim()
  const posId = settings?.p24_pos_id?.trim()
  const crc = resolveMaybeEncryptedSecret(settings?.p24_crc ?? null)?.trim()
  const apiKey = resolveMaybeEncryptedSecret(settings?.p24_api_key ?? null)?.trim()
  const apiUrl = settings?.p24_api_url?.trim()

  if (!merchantId || !posId || !crc || !apiUrl) {
    return {
      p24: createPrzelewy24Client(),
      configuredMerchantId: process.env.P24_MERCHANT_ID?.trim() ?? null,
    }
  }

  return {
    p24: createPrzelewy24Client({
      merchantId,
      posId,
      crc,
      apiKey: apiKey || crc,
      apiUrl,
    }),
    configuredMerchantId: merchantId,
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const payload: P24NotificationPayload = await request.json()

    console.log('[P24 WEBHOOK] Received notification:', {
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
      timestamp: new Date().toISOString(),
    })

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

    const subManager = createSubscriptionManager()
    const supabase = createAdminSupabaseClient()

    // Najpierw znajdz rekord po sessionId, aby dobrac poprawna konfiguracje P24 per salon.
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, salons(id, slug, owner_email, billing_email)')
      .eq('p24_transaction_id', payload.sessionId)
      .maybeSingle()

    const { data: invoice } = subscription
      ? { data: null as any }
      : await supabase
          .from('invoices')
          .select('id, salon_id, status, salons(id, slug, owner_email, billing_email)')
          .eq('p24_transaction_id', payload.sessionId)
          .maybeSingle()

    const salonId = subscription?.salons?.id || invoice?.salon_id

    if (!salonId) {
      console.error('[P24 WEBHOOK] Subscription or invoice not found:', {
        sessionId: payload.sessionId,
        error: subError,
      })
      return NextResponse.json(
        { error: 'Subscription or invoice not found' },
        { status: 404 }
      )
    }

    const { p24, configuredMerchantId } = await createP24ClientForSalon(supabase, salonId)

    if (configuredMerchantId && Number(configuredMerchantId) !== Number(payload.merchantId)) {
      console.error('[P24 WEBHOOK] Merchant mismatch:', {
        sessionId: payload.sessionId,
        expectedMerchantId: configuredMerchantId,
        receivedMerchantId: payload.merchantId,
      })
      return NextResponse.json({ error: 'Merchant mismatch' }, { status: 401 })
    }

    const signatureValid = p24.verifyNotificationSignature(payload)

    if (!signatureValid) {
      console.error('[P24 WEBHOOK] Invalid signature:', {
        sessionId: payload.sessionId,
        receivedSign: payload.sign,
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

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

    // Fallback dla scenariusza bez rekordu subskrypcji.
    if (!subscription && invoice) {
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

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    const salon = subscription.salons
    const pendingChange = (subscription.metadata as any)?.pending_plan_change
    const expectedAmount = pendingChange?.payment_amount_cents ?? subscription.amount_cents

    if (payload.amount !== expectedAmount) {
      console.error('[P24 WEBHOOK] Amount mismatch:', {
        sessionId: payload.sessionId,
        expected: expectedAmount,
        received: payload.amount,
      })
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
    }

    await subManager.handlePaymentSuccess({
      salonId: salon.id,
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
    })

    console.log('[P24 WEBHOOK] Payment success handled', {
      salonId: salon.id,
      salonSlug: salon.slug,
      subscriptionId: subscription.id,
      amount: payload.amount,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({ status: 'OK' }, { status: 200 })
  } catch (error) {
    console.error('[P24 WEBHOOK] Error:', error)

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
 * Obsluga OPTIONS (CORS preflight)
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
