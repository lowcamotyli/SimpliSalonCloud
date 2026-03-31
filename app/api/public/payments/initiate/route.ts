import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { getSalonId } from '@/lib/utils/salon'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'
import { logger } from '@/lib/logger'

interface InitiateBookingPaymentBody {
  bookingId: string
  returnUrl: string
}

function appendSessionParam(returnUrl: string, sessionId: string, appUrl: string): string {
  const url = new URL(returnUrl, appUrl)
  url.searchParams.set('session', sessionId)
  return url.toString()
}

function summarizeReturnUrl(returnUrl: string, appUrl: string): string | null {
  try {
    const url = new URL(returnUrl, appUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('[PUBLIC_PAYMENT_INITIATE] start', {
      method: request.method,
      pathname: request.nextUrl.pathname,
      origin: request.headers.get('origin') ?? undefined,
      referer: request.headers.get('referer') ?? undefined,
      hasApiKey: Boolean(request.headers.get('X-API-Key')),
      hasSalonHeader: Boolean(request.headers.get('X-Salon-Id')),
    })

    const authError = validateApiKey(request)
    if (authError) {
      logger.warn('[PUBLIC_PAYMENT_INITIATE] api key invalid')
      return authError
    }

    const salonId = getSalonId(request)
    if (!salonId) {
      logger.error('[PUBLIC_PAYMENT_INITIATE] missing salon id')
      return NextResponse.json({ error: 'PUBLIC_SALON_ID is not configured' }, { status: 500 })
    }

    logger.info('[PUBLIC_PAYMENT_INITIATE] salon resolved', {
      salonId,
      salonSource: request.headers.get('X-Salon-Id') ? 'header' : 'env',
    })

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.error('[PUBLIC_PAYMENT_INITIATE] invalid json body', error)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsedBody = body as Partial<InitiateBookingPaymentBody>
    const bookingId = typeof parsedBody.bookingId === 'string' ? parsedBody.bookingId.trim() : ''
    const returnUrl = typeof parsedBody.returnUrl === 'string' ? parsedBody.returnUrl.trim() : ''

    if (!bookingId || !returnUrl) {
      logger.warn('[PUBLIC_PAYMENT_INITIATE] missing required fields', {
        hasBookingId: Boolean(bookingId),
        hasReturnUrl: Boolean(returnUrl),
      })
      return NextResponse.json({ error: 'bookingId and returnUrl are required' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL is required')
    }

    logger.info('[PUBLIC_PAYMENT_INITIATE] payload parsed', {
      salonId,
      bookingId,
      returnUrl: summarizeReturnUrl(returnUrl, appUrl) ?? '[invalid-url]',
    })

    const supabase = createAdminSupabaseClient()

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, salon_id, client_id, base_price')
      .eq('id', bookingId)
      .eq('salon_id', salonId)
      .single()

    if (bookingError || !booking) {
      logger.warn('[PUBLIC_PAYMENT_INITIATE] booking not found', {
        salonId,
        bookingId,
        bookingErrorCode: bookingError?.code,
        bookingErrorMessage: bookingError?.message,
        bookingErrorDetails: bookingError?.details,
      })
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    logger.info('[PUBLIC_PAYMENT_INITIATE] booking resolved', {
      salonId,
      bookingId: booking.id,
      clientId: booking.client_id,
      amount: booking.base_price,
    })

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('email')
      .eq('id', booking.client_id)
      .eq('salon_id', salonId)
      .single()

    if (clientError || !client?.email) {
      logger.warn('[PUBLIC_PAYMENT_INITIATE] client email missing', {
        salonId,
        bookingId: booking.id,
        clientId: booking.client_id,
        hasEmail: Boolean(client?.email),
        clientErrorCode: clientError?.code,
        clientErrorMessage: clientError?.message,
        clientErrorDetails: clientError?.details,
      })
      return NextResponse.json({ error: 'Client email not found' }, { status: 404 })
    }

    const sessionId = `p24_${randomUUID()}`
    const amount = Math.round(Number(booking.base_price) * 100)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Booking amount is invalid')
    }

    logger.info('[PUBLIC_PAYMENT_INITIATE] creating p24 transaction', {
      salonId,
      bookingId: booking.id,
      sessionId,
      amount,
    })

    const p24 = createPrzelewy24Client()
    const { paymentUrl } = await p24.createTransaction({
      sessionId,
      amount,
      description: `Wizyta #${bookingId.slice(0, 8)}`,
      email: client.email,
      returnUrl: appendSessionParam(returnUrl, sessionId, appUrl),
      statusUrl: `${appUrl}/api/billing/webhook`,
    })

    logger.info('[PUBLIC_PAYMENT_INITIATE] p24 transaction created', {
      salonId,
      bookingId: booking.id,
      sessionId,
      hasPaymentUrl: Boolean(paymentUrl),
    })

    const { error: insertError } = await supabase.from('booking_payments').insert({
      salon_id: salonId,
      booking_id: booking.id,
      amount: booking.base_price,
      p24_session_id: sessionId,
      p24_order_id: null,
      payment_url: paymentUrl,
      status: 'pending',
    })

    if (insertError) {
      logger.error('[PUBLIC_PAYMENT_INITIATE] failed to create booking payment', insertError, {
        salonId,
        bookingId: booking.id,
        sessionId,
      })
      throw new Error(`Failed to create booking payment: ${insertError.message}`)
    }

    logger.info('[PUBLIC_PAYMENT_INITIATE] success', {
      salonId,
      bookingId: booking.id,
      sessionId,
    })
    return NextResponse.json({ paymentUrl, sessionId })
  } catch (error) {
    logger.error('[PUBLIC_PAYMENT_INITIATE] unhandled error', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
