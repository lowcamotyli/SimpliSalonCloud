import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { AppError } from '@/lib/errors'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { renewWatch, startWatch } from '@/lib/booksy/watch-client'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type WatchStatusPayload = {
  watch_status: string | null
  watch_expiration: string | null
  last_notification_at: string | null
}

function isWatchFeatureEnabled(): boolean {
  const raw = process.env.BOOKSY_USE_WATCH

  if (!raw) {
    return false
  }

  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function watchCircuitBreakerResponse(): NextResponse<{ error: string }> {
  return NextResponse.json(
    { error: 'Booksy watch is disabled by circuit breaker (BOOKSY_USE_WATCH is falsy)' },
    { status: 503 }
  )
}

function ensureWatchConfiguration(): void {
  const requiredEnvVars = ['GOOGLE_BOOKSY_PUBSUB_TOPIC'] as const
  const missing = requiredEnvVars.filter((name) => {
    const value = process.env[name]
    return !value || value.trim().length === 0
  })

  if (missing.length > 0) {
    throw new AppError(
      `Booksy watch is enabled but missing required configuration: ${missing.join(', ')}`,
      'BOOKSY_WATCH_NOT_CONFIGURED',
      503,
      { missing }
    )
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
    throw new ForbiddenError('Only salon owner can manage Booksy watch')
  }
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  if (!isWatchFeatureEnabled()) {
    return watchCircuitBreakerResponse()
  }

  ensureWatchConfiguration()

  const cronAuthError = validateCronSecret(request)
  if (!cronAuthError) {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const requestedAccountId = typeof body?.accountId === 'string' ? body.accountId : null

    if (!requestedAccountId) {
      throw new ValidationError('accountId is required for cron-triggered Booksy watch renewal')
    }

    const { data: account, error: accountError } = await (supabase
      .from('booksy_gmail_accounts') as any)
      .select('id, salon_id')
      .eq('id', requestedAccountId)
      .eq('is_active', true)
      .maybeSingle()

    if (accountError) {
      throw accountError
    }

    if (!account?.id || !account?.salon_id) {
      throw new ValidationError('Active Booksy Gmail account not found for watch renewal')
    }

    const { data: existingWatch, error: existingWatchError } = await (supabase
      .from('booksy_gmail_watches') as any)
      .select('id')
      .eq('salon_id', account.salon_id)
      .eq('booksy_gmail_account_id', account.id)
      .maybeSingle()

    if (existingWatchError) {
      throw existingWatchError
    }

    const watchResult = existingWatch?.id
      ? await renewWatch(account.salon_id, supabase, account.id)
      : await startWatch(account.salon_id, supabase, account.id)

    return NextResponse.json({
      watch_status: watchResult.watchStatus,
      watch_expiration: watchResult.watchExpiration,
    })
  }

  const { supabase, salonId } = await getAuthContext()
  await requireOwnerRole(supabase)
  const adminSupabase = createAdminClient()

  const body = await request.json().catch(() => ({}))
  const requestedAccountId = typeof body?.accountId === 'string' ? body.accountId : null

  const accountQuery = (supabase
    .from('booksy_gmail_accounts') as any)
    .select('id')
    .eq('salon_id', salonId)
    .eq('is_active', true)

  const { data: account, error: accountError } = requestedAccountId
    ? await accountQuery.eq('id', requestedAccountId).maybeSingle()
    : await accountQuery.order('is_primary', { ascending: false }).limit(1).maybeSingle()

  if (accountError) {
    throw accountError
  }

  if (!account?.id) {
    throw new ValidationError('No active Booksy Gmail account found for this salon')
  }

  const { data: existingWatch, error: existingWatchError } = await (supabase
    .from('booksy_gmail_watches') as any)
    .select('id')
    .eq('salon_id', salonId)
    .eq('booksy_gmail_account_id', account.id)
    .maybeSingle()

  if (existingWatchError) {
    throw existingWatchError
  }

  try {
    const watchResult = existingWatch?.id
      ? await renewWatch(salonId, adminSupabase, account.id)
      : await startWatch(salonId, adminSupabase, account.id)

    return NextResponse.json({
      watch_status: watchResult.watchStatus,
      watch_expiration: watchResult.watchExpiration,
    })
  } catch (error) {
    console.error('[watch/POST] renewWatch/startWatch failed', {
      accountId: account.id,
      salonId,
      existingWatchId: existingWatch?.id ?? null,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined,
    })
    throw error
  }
})

export const GET = withErrorHandling(async () => {
  if (!isWatchFeatureEnabled()) {
    return watchCircuitBreakerResponse()
  }

  ensureWatchConfiguration()

  const { supabase, salonId } = await getAuthContext()
  await requireOwnerRole(supabase)

  const { data: account, error: accountError } = await (supabase
    .from('booksy_gmail_accounts') as any)
    .select('id')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (accountError) {
    throw accountError
  }

  if (!account?.id) {
    return NextResponse.json({
      watch_status: null,
      watch_expiration: null,
      last_notification_at: null,
    } satisfies WatchStatusPayload)
  }

  const { data, error } = await (supabase
    .from('booksy_gmail_watches') as any)
    .select('watch_status, watch_expiration, last_notification_at')
    .eq('salon_id', salonId)
    .eq('booksy_gmail_account_id', account.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  const payload: WatchStatusPayload = {
    watch_status: data?.watch_status ?? null,
    watch_expiration: data?.watch_expiration ?? null,
    last_notification_at: data?.last_notification_at ?? null,
  }

  return NextResponse.json(payload)
})
