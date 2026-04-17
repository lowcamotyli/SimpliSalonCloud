import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { isRetryableBooksyFailure } from '@/lib/booksy/retry-policy'
import { hasBooksyWorkerScope, parseBooksyWorkerScope, type BooksyWorkerScope } from '@/lib/booksy/worker-scope'

export const runtime = 'nodejs'

type RepairStep = 'notifications' | 'reconcile' | 'parse' | 'apply'

const DEFAULT_STEPS: RepairStep[] = ['notifications', 'reconcile', 'parse', 'apply']
const REPAIR_STEP_SET = new Set<RepairStep>(DEFAULT_STEPS)

type RepairConfig = {
  scope: BooksyWorkerScope
  steps: RepairStep[]
  dryRun: boolean
  windowDays: number
  includeForwarded: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function parseRepairConfig(body: unknown): RepairConfig {
  const record = asRecord(body)
  const requestedSteps = Array.isArray(record.steps)
    ? record.steps.filter((step): step is RepairStep => typeof step === 'string' && REPAIR_STEP_SET.has(step as RepairStep))
    : DEFAULT_STEPS
  const requestedWindowDays = Number(record.windowDays)

  return {
    scope: parseBooksyWorkerScope(body),
    steps: requestedSteps.length > 0 ? requestedSteps : DEFAULT_STEPS,
    dryRun: record.dryRun !== false,
    windowDays: Number.isFinite(requestedWindowDays) && requestedWindowDays > 0
      ? Math.min(requestedWindowDays, 30)
      : 3,
    includeForwarded: record.includeForwarded !== false,
  }
}

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

async function postInternal(request: NextRequest, path: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(new URL(path, request.url), {
    method: 'POST',
    headers: getCronHeaders(),
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}${payload ? `: ${JSON.stringify(payload)}` : ''}`)
  }

  return payload
}

async function loadScopedAccounts(
  supabase: ReturnType<typeof createAdminClient>,
  scope: BooksyWorkerScope
): Promise<Array<{ id: string; salon_id: string; gmail_email: string }>> {
  let query = supabase
    .from('booksy_gmail_accounts')
    .select('id, salon_id, gmail_email')
    .eq('is_active', true)

  if (scope.salonIds) {
    query = query.in('salon_id', scope.salonIds)
  }

  if (scope.accountIds) {
    query = query.in('id', scope.accountIds)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to load scoped Booksy accounts: ${error.message}`)
  }

  return data ?? []
}

async function buildDryRunSummary(
  supabase: ReturnType<typeof createAdminClient>,
  config: RepairConfig,
  accountIds: string[],
  salonIds: string[]
) {
  const [
    notifications,
    rawPending,
    rawFailed,
    parsedPending,
    manualReview,
  ] = await Promise.all([
    supabase
      .from('booksy_gmail_notifications')
      .select('processing_status, error_message')
      .in('booksy_gmail_account_id', accountIds),
    supabase
      .from('booksy_raw_emails')
      .select('id', { count: 'exact', head: true })
      .in('booksy_gmail_account_id', accountIds)
      .eq('parse_status', 'pending'),
    supabase
      .from('booksy_raw_emails')
      .select('id', { count: 'exact', head: true })
      .in('booksy_gmail_account_id', accountIds)
      .eq('parse_status', 'failed'),
    (supabase
      .from('booksy_parsed_events') as any)
      .select('id', { count: 'exact', head: true })
      .in('salon_id', salonIds)
      .eq('status', 'pending'),
    (supabase
      .from('booksy_parsed_events') as any)
      .select('id', { count: 'exact', head: true })
      .in('salon_id', salonIds)
      .eq('status', 'manual_review'),
  ])

  for (const result of [notifications, rawPending, rawFailed, parsedPending, manualReview]) {
    if (result.error) {
      throw new Error(result.error.message)
    }
  }

  const notificationRows = notifications.data ?? []
  const pendingNotifications = notificationRows.filter((row) => row.processing_status === 'pending').length
  const retryableFailedNotifications = notificationRows
    .filter((row) => row.processing_status === 'failed' && isRetryableBooksyFailure(row.error_message))
    .length

  return {
    dryRun: true,
    scope: config.scope,
    steps: config.steps,
    accounts: accountIds.length,
    pendingNotifications,
    retryableFailedNotifications,
    rawParsePending: rawPending.count ?? 0,
    rawParseFailed: rawFailed.count ?? 0,
    parsedEventsPending: parsedPending.count ?? 0,
    manualReview: manualReview.count ?? 0,
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = validateCronSecret(request)
    if (authError) {
      return authError
    }

    const body = await request.json().catch(() => ({}))
    const config = parseRepairConfig(body)

    if (!hasBooksyWorkerScope(config.scope)) {
      return NextResponse.json(
        { error: 'Repair requires salonIds or accountIds scope' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const accounts = await loadScopedAccounts(supabase, config.scope)
    const accountIds = accounts.map((account) => account.id)
    const salonIds = Array.from(new Set(accounts.map((account) => account.salon_id)))

    if (accountIds.length === 0) {
      return NextResponse.json(
        { error: 'No active Booksy Gmail accounts matched repair scope' },
        { status: 404 }
      )
    }

    if (config.dryRun) {
      return NextResponse.json(await buildDryRunSummary(supabase, config, accountIds, salonIds))
    }

    const results: Record<string, unknown> = {}
    const workerScope = {
      salonIds,
      accountIds,
    }

    logger.info('Booksy repair worker: run started', {
      action: 'booksy_repair_start',
      steps: config.steps,
      scope: workerScope,
      windowDays: config.windowDays,
    })

    if (config.steps.includes('notifications')) {
      results.notifications = await postInternal(request, '/api/internal/booksy/process-notifications', {
        ...workerScope,
        includeRetryableFailed: true,
      })
    }

    if (config.steps.includes('reconcile')) {
      results.reconcile = []
      for (const accountId of accountIds) {
        ;(results.reconcile as unknown[]).push(await postInternal(request, '/api/internal/booksy/reconcile', {
          accountId,
          windowDays: config.windowDays,
          includeForwarded: config.includeForwarded,
        }))
      }
    }

    if (config.steps.includes('parse')) {
      results.parse = await postInternal(request, '/api/internal/booksy/parse', workerScope)
    }

    if (config.steps.includes('apply')) {
      results.apply = await postInternal(request, '/api/internal/booksy/apply', workerScope)
    }

    logger.info('Booksy repair worker: run completed', {
      action: 'booksy_repair_completed',
      steps: config.steps,
      scope: workerScope,
    })

    return NextResponse.json({
      success: true,
      dryRun: false,
      scope: workerScope,
      results,
    })
  } catch (error) {
    logger.error('Booksy repair worker failed', error, {
      action: 'booksy_repair_failed',
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Booksy repair failed' },
      { status: 500 }
    )
  }
}
