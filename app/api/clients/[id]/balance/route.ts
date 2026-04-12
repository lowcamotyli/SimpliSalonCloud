import { NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Database } from '@/types/supabase'

type BalanceSummaryRow = Database['public']['Views']['client_balance_summary']['Row']
type BalanceTransactionRow = Database['public']['Tables']['client_balance_transactions']['Row']

// GET /api/clients/[id]/balance
export const GET = withErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('salon_id', salonId)
    .single()

  if (clientError || !client) {
    throw new NotFoundError('Client', clientId)
  }

  const { data: balanceSummary, error: balanceError } = await supabase
    .from('client_balance_summary')
    .select('balance')
    .eq('client_id', clientId)
    .eq('salon_id', salonId)
    .maybeSingle<Pick<BalanceSummaryRow, 'balance'>>()

  if (balanceError) {
    throw balanceError
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from('client_balance_transactions')
    .select('id, amount, type, booking_id, description, created_at, created_by')
    .eq('client_id', clientId)
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (transactionsError) {
    throw transactionsError
  }

  const typedTransactions: Pick<
    BalanceTransactionRow,
    'id' | 'amount' | 'type' | 'booking_id' | 'description' | 'created_at' | 'created_by'
  >[] = transactions ?? []

  return NextResponse.json({
    balance: balanceSummary?.balance ?? 0,
    transactions: typedTransactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      booking_id: transaction.booking_id,
      description: transaction.description,
      created_at: transaction.created_at,
      created_by: transaction.created_by,
    })),
  })
})
