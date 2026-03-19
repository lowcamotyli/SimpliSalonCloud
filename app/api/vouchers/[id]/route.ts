import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface VoucherWithTransactions {
  id: string
  salon_id: string
  voucher_transactions?: Array<{ created_at: string | null }> | null
  [key: string]: unknown
}

function parsePatchBody(body: unknown): { status: 'expired' } {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body')
  }

  const candidate = body as Record<string, unknown>
  const keys = Object.keys(candidate)
  if (keys.length !== 1 || keys[0] !== 'status') {
    throw new ValidationError('Only status field can be updated')
  }

  if (candidate.status !== 'expired') {
    throw new ValidationError('Only status="expired" is allowed')
  }

  return { status: 'expired' }
}

async function requireOwnerRole(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
) {
  const { data, error } = await supabase.rpc('has_salon_role', {
    required_role: 'owner',
  })

  if (error) throw error
  if (!data) throw new ForbiddenError('Only owner can manually expire vouchers')
}

async function getVoucherById(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  id: string
) {
  const { data: voucher, error } = await supabase
    .from('vouchers')
    .select(`
      *,
      voucher_transactions(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Voucher', id)
    throw error
  }

  return voucher as VoucherWithTransactions
}

// GET /api/vouchers/[id] - get voucher with transactions
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const rl = await applyRateLimit(request)
  if (rl) return rl

  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const voucher = await getVoucherById(supabase, id)
  if (voucher.salon_id !== salonId) {
    throw new ForbiddenError('Voucher does not belong to your salon')
  }

  const transactions = Array.isArray(voucher.voucher_transactions)
    ? [...voucher.voucher_transactions].sort((a, b) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
    : []

  return NextResponse.json({
    voucher: {
      ...voucher,
      voucher_transactions: transactions,
    },
  })
})

// PATCH /api/vouchers/[id] - manually mark voucher as expired (owner only)
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl

  const { id } = await params
  const { supabase, salonId } = await getAuthContext()
  const body = parsePatchBody(await request.json())

  await requireOwnerRole(supabase)

  const voucher = await getVoucherById(supabase, id)
  if (voucher.salon_id !== salonId) {
    throw new ForbiddenError('Voucher does not belong to your salon')
  }

  const { data: updatedVoucher, error } = await supabase
    .from('vouchers')
    .update({ status: body.status })
    .eq('id', id)
    .eq('salon_id', salonId)
    .select(`
      *,
      voucher_transactions(*)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Voucher', id)
    throw error
  }

  return NextResponse.json({ voucher: updatedVoucher })
})
