import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ValidationError } from '@/lib/errors'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface CreateVoucherBody {
  buyerClientId?: string
  beneficiaryClientId?: string
  initialValue: number
  validityDays: number
}

function parseCreateVoucherBody(body: unknown): CreateVoucherBody {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Invalid request body')
  }

  const candidate = body as Partial<CreateVoucherBody>

  if (typeof candidate.initialValue !== 'number' || Number.isNaN(candidate.initialValue) || candidate.initialValue <= 0) {
    throw new ValidationError('initialValue must be a positive number')
  }

  if (typeof candidate.validityDays !== 'number' || !Number.isInteger(candidate.validityDays) || candidate.validityDays <= 0) {
    throw new ValidationError('validityDays must be a positive integer')
  }

  if (candidate.buyerClientId !== undefined && typeof candidate.buyerClientId !== 'string') {
    throw new ValidationError('buyerClientId must be a string')
  }

  if (candidate.beneficiaryClientId !== undefined && typeof candidate.beneficiaryClientId !== 'string') {
    throw new ValidationError('beneficiaryClientId must be a string')
  }

  return {
    buyerClientId: candidate.buyerClientId,
    beneficiaryClientId: candidate.beneficiaryClientId,
    initialValue: candidate.initialValue,
    validityDays: candidate.validityDays,
  }
}

// GET /api/vouchers - List vouchers for the authenticated salon
export const GET = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request)
  if (rl) return rl

  const { supabase, salonId } = await getAuthContext()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const code = searchParams.get('code')
  const clientId = searchParams.get('clientId')

  let query = supabase
    .from('vouchers')
    .select('*')
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }
  if (code) {
    query = query.eq('code', code.toUpperCase())
  }
  if (clientId) {
    query = query.or(`buyer_client_id.eq.${clientId},beneficiary_client_id.eq.${clientId}`)
  }

  const { data: vouchers, error } = await query

  if (error) {
    throw error
  }

  return NextResponse.json(vouchers ?? [])
})

// POST /api/vouchers - Create a voucher for the authenticated salon
export const POST = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl

  const { supabase, salonId, user } = await getAuthContext()
  const body = parseCreateVoucherBody(await request.json())

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + body.validityDays)

  const { data: voucher, error } = await supabase
    .from('vouchers')
    .insert({
      salon_id: salonId,
      buyer_client_id: body.buyerClientId ?? null,
      beneficiary_client_id: body.beneficiaryClientId ?? null,
      initial_value: body.initialValue,
      current_balance: body.initialValue,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return NextResponse.json(voucher, { status: 201 })
})
