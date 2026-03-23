import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface RedeemBody {
  bookingId: string
  amount: number
}

interface VoucherRow {
  id: string
  salon_id: string
  status: 'active' | 'used' | 'expired'
  expires_at: string
  current_balance: number | string
}

function parseRedeemBody(body: unknown): RedeemBody {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body')
  }

  const candidate = body as Partial<RedeemBody>

  if (typeof candidate.bookingId !== 'string' || candidate.bookingId.trim().length === 0) {
    throw new Error('bookingId must be a non-empty string')
  }

  if (typeof candidate.amount !== 'number' || Number.isNaN(candidate.amount) || candidate.amount <= 0) {
    throw new Error('amount must be a positive number')
  }

  return {
    bookingId: candidate.bookingId,
    amount: candidate.amount,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { bookingId, amount } = parseRedeemBody(await req.json())

    const { supabase, salonId } = await (
      getAuthContext as (request: NextRequest) => ReturnType<typeof getAuthContext>
    )(req)

    const { data: voucher, error: voucherError } = await supabase
      .from('vouchers')
      .select('id, salon_id, status, expires_at, current_balance')
      .eq('id', id)
      .single()

    if (voucherError || !voucher) {
      if (voucherError?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch voucher' }, { status: 500 })
    }

    const voucherRow = voucher as VoucherRow

    if (voucherRow.salon_id !== salonId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const expiresAt = new Date(voucherRow.expires_at)
    const currentBalance = Number(voucherRow.current_balance)

    if (
      voucherRow.status !== 'active' ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt <= new Date() ||
      currentBalance <= 0
    ) {
      return NextResponse.json(
        { error: 'Voucher is not redeemable in current state' },
        { status: 409 }
      )
    }

    // Idempotency: if this booking was already redeemed, return existing result
    const { data: existingTx } = await supabase
      .from('voucher_transactions')
      .select('amount, balance_after')
      .eq('voucher_id', id)
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (existingTx) {
      return NextResponse.json(
        {
          deducted: Math.abs(existingTx.amount),
          balanceAfter: existingTx.balance_after,
          status: voucherRow.status,
        },
        { status: 200 }
      )
    }

    const deductedAmount = Math.min(amount, currentBalance)
    const newBalance = currentBalance - deductedAmount
    const newStatus: 'active' | 'used' = newBalance <= 0 ? 'used' : 'active'

    const { data: updatedVoucher, error: updateError } = await supabase
      .from('vouchers')
      .update({
        current_balance: newBalance,
        status: newStatus,
      })
      .eq('id', id)
      .eq('current_balance', Number(voucherRow.current_balance))
      .select('id')
      .maybeSingle()

    if (updateError || !updatedVoucher) {
      return NextResponse.json(
        { error: 'Failed to update voucher balance' },
        { status: 500 }
      )
    }

    const { error: txError } = await supabase.from('voucher_transactions').insert({
      voucher_id: id,
      booking_id: bookingId,
      amount: -deductedAmount,
      balance_after: newBalance,
      note: 'Potracenie za wizyte',
    })

    if (txError) {
      return NextResponse.json(
        { error: 'Failed to create voucher transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        deducted: deductedAmount,
        balanceAfter: newBalance,
        status: newStatus,
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
