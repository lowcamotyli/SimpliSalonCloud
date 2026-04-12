import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

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
    throw new ForbiddenError('Only salon owner can replay Booksy mailbox data')
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
  request: NextRequest,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(new URL(path, request.url), {
    method: 'POST',
    headers: getCronHeaders(),
    body: JSON.stringify(body ?? {}),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}${payload ? `: ${JSON.stringify(payload)}` : ''}`)
  }

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

  logger.info('Booksy replay UI route: starting 24h replay pipeline', {
    action: 'booksy_replay_ui_start',
    salonId,
    accountId,
  })

  const replay = await postInternal(request, '/api/internal/booksy/reconcile', {
    accountId,
    windowDays: 1,
    includeForwarded: true,
    syncFromDate: settings?.booksy_sync_from_date ?? null,
  })
  logger.info('Booksy replay UI route: reconcile stage completed', {
    action: 'booksy_replay_ui_reconcile_completed',
    salonId,
    accountId,
    replay,
  })

  const parse = await postInternal(request, '/api/internal/booksy/parse')
  logger.info('Booksy replay UI route: parse stage completed', {
    action: 'booksy_replay_ui_parse_completed',
    salonId,
    accountId,
    parse,
  })

  const apply = await postInternal(request, '/api/internal/booksy/apply')
  logger.info('Booksy replay UI route: apply stage completed', {
    action: 'booksy_replay_ui_apply_completed',
    salonId,
    accountId,
    apply,
  })

  logger.info('Booksy replay UI route: 24h replay pipeline completed', {
    action: 'booksy_replay_ui_completed',
    salonId,
    accountId,
  })

  return NextResponse.json({
    success: true,
    accountId,
    replayWindowHours: 24,
    syncFromDate: settings?.booksy_sync_from_date ?? null,
    replay,
    parse,
    apply,
  })
})
