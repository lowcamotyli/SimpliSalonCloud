import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface InitiateBookingPaymentBody {
  bookingId: string
  returnUrl: string
}

function appendSessionParam(returnUrl: string, sessionId: string, appUrl: string) {
  const url = new URL(returnUrl, appUrl)
  url.searchParams.set('session', sessionId)
  return url.toString()
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<InitiateBookingPaymentBody>
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId.trim() : ''
    const returnUrl = typeof body.returnUrl === 'string' ? body.returnUrl.trim() : ''

    if (!bookingId || !returnUrl) {
      return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL is required')
    }

    const { supabase, salonId } = await getAuthContext()

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, salon_id, client_id, base_price')
      .eq('id', bookingId)
      .eq('salon_id', salonId)
      .single()

    if (bookingError || !booking) {
      throw new Error(`Failed to fetch booking: ${bookingError?.message || 'Booking not found'}`)
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('email')
      .eq('id', booking.client_id)
      .eq('salon_id', salonId)
      .single()

    if (clientError || !client?.email) {
      throw new Error(`Failed to fetch client email: ${clientError?.message || 'Client email missing'}`)
    }

    const sessionId = `p24_${randomUUID()}`
    const amount = Math.round(Number(booking.base_price) * 100)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Booking amount is invalid')
    }

    const p24 = createPrzelewy24Client()
    const { paymentUrl } = await p24.createTransaction({
      sessionId,
      amount,
      description: `Wizyta #${booking.id.slice(0, 8)}`,
      email: client.email,
      returnUrl: appendSessionParam(returnUrl, sessionId, appUrl),
      statusUrl: `${appUrl}/api/billing/webhook`,
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
      throw new Error(`Failed to create booking payment: ${insertError.message}`)
    }

    return NextResponse.json({ paymentUrl, sessionId })
  } catch (error) {
    console.error('[BOOKING PAYMENT INITIATE] Error:', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
