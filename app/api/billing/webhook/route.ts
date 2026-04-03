import { NextRequest, NextResponse } from 'next/server'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { logger } from '@/lib/logger'

type SubscriptionPlan = 'starter' | 'professional' | 'business' | 'enterprise'

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidPayload(payload: unknown): payload is P24NotificationPayload {
  if (!payload || typeof payload !== 'object') return false

  const p = payload as Record<string, unknown>

  return (
    isValidNumber(p.merchantId) &&
    isValidNumber(p.posId) &&
    isNonEmptyString(p.sessionId) &&
    isValidNumber(p.amount) &&
    isValidNumber(p.originAmount) &&
    isNonEmptyString(p.currency) &&
    isValidNumber(p.orderId) &&
    isValidNumber(p.methodId) &&
    isNonEmptyString(p.statement) &&
    isNonEmptyString(p.sign)
  )
}

function extractPlanType(lineItems: any): SubscriptionPlan | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return null
  }

  const firstItem = lineItems[0]
  if (!firstItem || typeof firstItem !== 'object') {
    return null
  }

  const planFromField = (firstItem as Record<string, unknown>).plan_type
  if (typeof planFromField === 'string') {
    const normalized = planFromField.toLowerCase() as SubscriptionPlan
    if (['starter', 'professional', 'business', 'enterprise'].includes(normalized)) {
      return normalized
    }
  }

  const description = (firstItem as Record<string, unknown>).description
  if (typeof description === 'string') {
    const match = description.toLowerCase().match(/\b(starter|professional|business|enterprise)\b/)
    if (match) {
      return match[1] as SubscriptionPlan
    }
  }

  return null
}

function extractSmsCredits(lineItems: any): number {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return 0

  const quantity = lineItems[0]?.quantity
  if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0) {
    return Math.floor(quantity)
  }

  return 0
}

async function markInvoiceVoid(admin: any, invoiceId: string) {
  await admin
    .from('invoices')
    .update({ status: 'void' })
    .eq('id', invoiceId)
}

async function addSmsWalletBalance(admin: any, salonId: string, credits: number) {
  const { data: existingWallet, error: fetchError } = await admin
    .from('sms_wallet')
    .select('id, balance')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Failed to read sms_wallet: ${fetchError.message}`)
  }

  if (!existingWallet) {
    const { error: insertError } = await admin
      .from('sms_wallet')
      .insert({
        salon_id: salonId,
        balance: credits,
      })

    if (!insertError) return

    if (insertError.code !== '23505') {
      throw new Error(`Failed to insert sms_wallet: ${insertError.message}`)
    }

    const { data: walletAfterConflict, error: refetchError } = await admin
      .from('sms_wallet')
      .select('id, balance')
      .eq('salon_id', salonId)
      .single()

    if (refetchError || !walletAfterConflict) {
      throw new Error(`Failed to reload sms_wallet after conflict: ${refetchError?.message}`)
    }

    const { error: updateError } = await admin
      .from('sms_wallet')
      .update({ balance: (walletAfterConflict.balance || 0) + credits })
      .eq('id', walletAfterConflict.id)

    if (updateError) {
      throw new Error(`Failed to update sms_wallet after conflict: ${updateError.message}`)
    }

    return
  }

  const { error: updateError } = await admin
    .from('sms_wallet')
    .update({ balance: (existingWallet.balance || 0) + credits })
    .eq('id', existingWallet.id)

  if (updateError) {
    throw new Error(`Failed to update sms_wallet: ${updateError.message}`)
  }
}

async function upsertSubscriptionFromInvoice(admin: any, invoice: any, payload: P24NotificationPayload) {
  const planType = extractPlanType(invoice.line_items)
  if (!planType) {
    throw new Error('Unable to determine plan_type from invoice line_items')
  }

  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const baseUpdate = {
    status: 'active',
    plan_type: planType,
    billing_interval: 'monthly',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    amount_cents: invoice.total_cents,
    currency: invoice.currency || payload.currency,
    p24_transaction_id: payload.sessionId,
    p24_order_id: payload.orderId.toString(),
  }

  const { data: existingSubscription } = await admin
    .from('subscriptions')
    .select('id')
    .eq('salon_id', invoice.salon_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSubscription?.id) {
    const { error: updateError } = await admin
      .from('subscriptions')
      .update(baseUpdate)
      .eq('id', existingSubscription.id)

    if (updateError) {
      throw new Error(`Failed to update subscription: ${updateError.message}`)
    }

    return
  }

  const { error: insertError } = await admin
    .from('subscriptions')
    .insert({
      salon_id: invoice.salon_id,
      ...baseUpdate,
    })

  if (insertError) {
    throw new Error(`Failed to create subscription: ${insertError.message}`)
  }
}

async function createP24ClientForSalon(admin: any, salonId: string) {
  const { data: settings, error: settingsError } = await admin
    .from('salon_settings')
    .select('p24_merchant_id, p24_pos_id, p24_crc, p24_api_key, p24_api_url')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (settingsError) {
    throw new Error(`Failed to load salon payment settings: ${settingsError.message}`)
  }

  const merchantId = settings?.p24_merchant_id?.trim()
  const posId = settings?.p24_pos_id?.trim()
  const crc = resolveMaybeEncryptedSecret(settings?.p24_crc ?? null)?.trim()
  const apiKey = resolveMaybeEncryptedSecret(settings?.p24_api_key ?? null)?.trim()
  const apiUrl = settings?.p24_api_url?.trim()

  if (merchantId && posId && crc && apiUrl) {
    return createPrzelewy24Client({
      merchantId,
      posId,
      crc,
      apiKey: apiKey || crc,
      apiUrl,
    })
  }

  return createPrzelewy24Client()
}

export async function POST(request: NextRequest) {
  let payload: P24NotificationPayload

  try {
    const parsed = await request.json()
    if (!isValidPayload(parsed)) {
      return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 })
    }
    payload = parsed
  } catch {
    logger.warn('[BILLING_WEBHOOK] invalid json body', {
      pathname: request.nextUrl.pathname,
      host: request.headers.get('host') ?? undefined,
      forwardedHost: request.headers.get('x-forwarded-host') ?? undefined,
      origin: request.nextUrl.origin,
    })
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    logger.info('[BILLING_WEBHOOK] start', {
      pathname: request.nextUrl.pathname,
      host: request.headers.get('host') ?? undefined,
      forwardedHost: request.headers.get('x-forwarded-host') ?? undefined,
      origin: request.nextUrl.origin,
      referer: request.headers.get('referer') ?? undefined,
      sessionId: payload.sessionId,
      orderId: payload.orderId,
    })

    const admin = createAdminSupabaseClient()

    if (payload.sessionId.startsWith('p24_')) {
      const { data: latestBookingPayment, error: bookingPaymentError } = await admin
        .from('booking_payments')
        .select('id, salon_id, booking_id')
        .eq('p24_session_id', payload.sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (bookingPaymentError) {
        throw new Error(`Failed to load booking payment: ${bookingPaymentError.message}`)
      }

      if (!latestBookingPayment) {
        logger.warn('[BILLING_WEBHOOK] booking payment not found', {
          sessionId: payload.sessionId,
        })
        return NextResponse.json({ received: true }, { status: 200 })
      }

      logger.info('[BILLING_WEBHOOK] booking payment resolved', {
        sessionId: payload.sessionId,
        salonId: latestBookingPayment.salon_id,
      })

      const p24 = await createP24ClientForSalon(admin, latestBookingPayment.salon_id)
      const signatureValid = p24.verifyNotificationSignature(payload)

      if (!signatureValid) {
        const { error: failedUpdateError } = await admin
          .from('booking_payments')
          .update({ status: 'failed' })
          .eq('p24_session_id', payload.sessionId)
          .eq('salon_id', latestBookingPayment.salon_id)

        if (failedUpdateError) {
          throw new Error(`Failed to update booking payment status: ${failedUpdateError.message}`)
        }

        logger.warn('[BILLING_WEBHOOK] invalid booking payment signature', {
          sessionId: payload.sessionId,
          salonId: latestBookingPayment.salon_id,
        })
        return NextResponse.json({ received: true }, { status: 200 })
      }

      const verificationOk = await p24.verifyTransaction({
        sessionId: payload.sessionId,
        orderId: payload.orderId,
        amount: payload.amount,
        currency: payload.currency,
      })

      if (verificationOk) {
        const transactionId = payload.orderId.toString()
        const { error: paidUpdateError } = await admin
          .from('booking_payments')
          .update({
            status: 'paid',
            p24_transaction_id: transactionId,
            paid_at: new Date().toISOString(),
          })
          .eq('p24_session_id', payload.sessionId)
          .eq('salon_id', latestBookingPayment.salon_id)

        if (paidUpdateError) {
          throw new Error(`Failed to mark booking payment as paid: ${paidUpdateError.message}`)
        }

        const { error: bookingUpdateError } = await admin
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('id', latestBookingPayment.booking_id)
          .eq('salon_id', latestBookingPayment.salon_id)

        if (bookingUpdateError) {
          throw new Error(`Failed to confirm booking after payment: ${bookingUpdateError.message}`)
        }

        logger.info('[BILLING_WEBHOOK] booking payment marked paid', {
          sessionId: payload.sessionId,
          salonId: latestBookingPayment.salon_id,
          orderId: payload.orderId,
        })
      } else {
        const { error: failedUpdateError } = await admin
          .from('booking_payments')
          .update({ status: 'failed' })
          .eq('p24_session_id', payload.sessionId)
          .eq('salon_id', latestBookingPayment.salon_id)

        if (failedUpdateError) {
          throw new Error(`Failed to mark booking payment as failed: ${failedUpdateError.message}`)
        }

        logger.warn('[BILLING_WEBHOOK] booking payment verification failed', {
          sessionId: payload.sessionId,
          salonId: latestBookingPayment.salon_id,
          orderId: payload.orderId,
        })
      }

      return NextResponse.json({ received: true }, { status: 200 })
    }

    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select('id, salon_id, line_items, total_cents, currency, status')
      .eq('p24_transaction_id', payload.sessionId)
      .maybeSingle()

    if (invoiceError) {
      throw new Error(`Failed to load invoice: ${invoiceError.message}`)
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const p24 = await createP24ClientForSalon(admin, invoice.salon_id)
    const signatureValid = p24.verifyNotificationSignature(payload)

    if (!signatureValid) {
      await markInvoiceVoid(admin, invoice.id)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ status: 'OK' }, { status: 200 })
    }

    const verificationOk = await p24.verifyTransaction({
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    })

    if (!verificationOk) {
      await markInvoiceVoid(admin, invoice.id)
      return NextResponse.json({ error: 'Transaction verification failed' }, { status: 400 })
    }

    const { error: invoiceUpdateError } = await admin
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        p24_order_id: payload.orderId.toString(),
      })
      .eq('id', invoice.id)

    if (invoiceUpdateError) {
      throw new Error(`Failed to update invoice: ${invoiceUpdateError.message}`)
    }

    if (payload.sessionId.startsWith('sms_')) {
      const creditsToAdd = extractSmsCredits(invoice.line_items)
      if (creditsToAdd <= 0) {
        throw new Error('Invalid SMS package size in invoice line_items[0].quantity')
      }

      await addSmsWalletBalance(admin, invoice.salon_id, creditsToAdd)
    } else if (payload.sessionId.startsWith('sub_')) {
      await upsertSubscriptionFromInvoice(admin, invoice, payload)
    }

    return NextResponse.json({ status: 'OK' }, { status: 200 })
  } catch (error) {
    logger.error('[BILLING_WEBHOOK] unhandled error', error, {
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      pathname: request.nextUrl.pathname,
      host: request.headers.get('host') ?? undefined,
      forwardedHost: request.headers.get('x-forwarded-host') ?? undefined,
      origin: request.nextUrl.origin,
    })

    return NextResponse.json(
      {
        error: 'Failed to process billing webhook',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
