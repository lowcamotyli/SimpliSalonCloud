import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { getInternalBaseUrl } from '@/lib/config/app-url'

function getCronHeaders(): HeadersInit {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    throw new Error('CRON_SECRET not configured')
  }

  return {
    authorization: `Bearer ${secret}`,
    'x-cron-secret': secret,
    'content-type': 'application/json',
  }
}

async function requireOwnerRole(supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']): Promise<void> {
  const { data, error } = await supabase.rpc('has_salon_role', {
    required_role: 'owner',
  })

  if (error) {
    throw error
  }

  if (!data) {
    throw new ForbiddenError('Only salon owner can run Booksy reconciliation')
  }
}

async function ensureAccountBelongsToSalon(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string,
  accountId: string
): Promise<void> {
  const { data, error } = await (supabase
    .from('booksy_gmail_accounts') as any)
    .select('id')
    .eq('id', accountId)
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data?.id) {
    throw new ValidationError('Active Booksy Gmail account not found for this salon')
  }
}

async function postInternal(
  _request: NextRequest,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const baseUrl = getInternalBaseUrl()
  const fullUrl = `${baseUrl}${path}`
  const secret = process.env.CRON_SECRET ?? ''
  console.log(`[postInternal] url="${fullUrl}" secret_len=${secret.length} VERCEL_URL="${process.env.VERCEL_URL}" VERCEL_ENV="${process.env.VERCEL_ENV}"`)

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: getCronHeaders(),
    body: JSON.stringify(body ?? {}),
  })

  if (!response.ok) {
    const rawText = await response.text().catch(() => '')
    const payload = (() => { try { return JSON.parse(rawText) } catch { return null } })()
    console.error(`[postInternal] ${path} → ${response.status} | body="${rawText.slice(0, 300)}"`)
    throw new Error(`${path} failed with ${response.status}${payload ? `: ${JSON.stringify(payload)}` : ''}`)
  }

  const payload = await response.json().catch(() => null)
  return payload
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()
  await requireOwnerRole(supabase)

  const body = await request.json().catch(() => ({}))
  const accountId = typeof body?.accountId === 'string' ? body.accountId : null

  if (!accountId) {
    throw new ValidationError('accountId is required')
  }

  await ensureAccountBelongsToSalon(supabase, salonId, accountId)

  const { data: settings, error: settingsError } = await (supabase
    .from('salon_settings') as any)
    .select('*')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (settingsError) {
    throw settingsError
  }

  const reconcile = await postInternal(request, '/api/internal/booksy/reconcile', {
    accountId,
    windowDays: 14,
    includeForwarded: true,
    syncFromDate: settings?.booksy_sync_from_date ?? null,
  })
  const parse = await postInternal(request, '/api/internal/booksy/parse')
  const apply = await postInternal(request, '/api/internal/booksy/apply')

  return NextResponse.json({
    success: true,
    accountId,
    syncFromDate: settings?.booksy_sync_from_date ?? null,
    reconcile,
    parse,
    apply,
  })
})
