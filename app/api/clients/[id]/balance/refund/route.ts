import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { getBalanceActorEmployeeId } from '../helpers'

interface BalanceOperationBody {
  amount: number
  description?: string
  booking_id?: string
}

async function getCurrentBalance(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string,
  clientId: string
): Promise<number> {
  const { data: balanceSummary, error } = await supabase
    .from('client_balance_summary')
    .select('balance')
    .eq('client_id', clientId)
    .eq('salon_id', salonId)
    .maybeSingle<{ balance: number | null }>()

  if (error) {
    throw error
  }

  return typeof balanceSummary?.balance === 'number' ? balanceSummary.balance : 0
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id: clientId } = await params
    const { supabase, user, salonId } = await getAuthContext()
    const createdByEmployeeId = await getBalanceActorEmployeeId({ supabase, user, salonId })

    const body = (await request.json()) as BalanceOperationBody
    const amount = body.amount

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (clientError) {
      throw clientError
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const { error: insertError } = await supabase
      .from('client_balance_transactions')
      .insert({
        salon_id: salonId,
        client_id: clientId,
        type: 'refund',
        amount,
        description: typeof body.description === 'string' ? body.description : null,
        created_by: createdByEmployeeId,
      })

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({
      success: true,
      new_balance: await getCurrentBalance(supabase, salonId, clientId),
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
