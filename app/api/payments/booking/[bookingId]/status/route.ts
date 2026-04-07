import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
): Promise<NextResponse> => {
  const { bookingId } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: payment, error } = await supabase
    .from('booking_payments')
    .select('status, amount, paid_at, payment_url, created_at')
    .eq('booking_id', bookingId)
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!payment) {
    return NextResponse.json({ status: 'none' })
  }

  return NextResponse.json({
    status: payment.status,
    amount: payment.amount,
    paidAt: payment.paid_at,
    paymentUrl: payment.payment_url,
  })
})
