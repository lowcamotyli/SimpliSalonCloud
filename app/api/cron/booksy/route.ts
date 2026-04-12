import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { logger } from '@/lib/logger'

function isWatchFeatureEnabled(): boolean {
  const raw = process.env.BOOKSY_USE_WATCH

  if (!raw) {
    return false
  }

  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function getCronHeaders(): HeadersInit {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    throw new Error('CRON_SECRET not configured')
  }

  return {
    authorization: `Bearer ${secret}`,
    'x-cron-secret': secret,
  }
}

async function postCronEndpoint(
  request: NextRequest,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(new URL(path, request.url), {
    method: 'POST',
    headers: {
      ...getCronHeaders(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}${payload ? `: ${JSON.stringify(payload)}` : ''}`)
  }

  return payload
}

async function shouldRunDailyReconciliation(
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('booksy_reconciliation_runs')
    .select('id')
    .gte('started_at', dayStart.toISOString())
    .in('status', ['running', 'completed'])
    .limit(1)

  if (error) {
    throw error
  }

  return (data ?? []).length === 0
}

async function runWatchPipeline(request: NextRequest) {
  const supabase = createAdminClient()
  const threshold = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()

  const processNotifications = await postCronEndpoint(request, '/api/internal/booksy/process-notifications')
  const parse = await postCronEndpoint(request, '/api/internal/booksy/parse')
  const apply = await postCronEndpoint(request, '/api/internal/booksy/apply')
  const reconcile = await shouldRunDailyReconciliation(supabase)
    ? await postCronEndpoint(request, '/api/internal/booksy/reconcile')
    : { skipped: true, reason: 'already-ran-today' }

  const { data: expiringWatches, error: watchesError } = await (supabase
    .from('booksy_gmail_watches') as any)
    .select('booksy_gmail_account_id, watch_expiration, watch_status')
    .eq('watch_status', 'active')
    .not('watch_expiration', 'is', null)
    .lte('watch_expiration', threshold)

  if (watchesError) {
    throw watchesError
  }

  const renewedWatches = []

  for (const watch of expiringWatches ?? []) {
    const renewal = await postCronEndpoint(request, '/api/integrations/booksy/watch', {
      accountId: watch.booksy_gmail_account_id,
    })

    renewedWatches.push({
      accountId: watch.booksy_gmail_account_id,
      previousExpiration: watch.watch_expiration,
      result: renewal,
    })
  }

  return {
    mode: 'watch',
    pipeline: {
      processNotifications,
      parse,
      apply,
      reconcile,
    },
    renewedWatches,
  }
}

async function saveReauthLog(supabase: ReturnType<typeof createAdminClient>, salonId: string) {
  await supabase.from('booksy_sync_logs').insert({
    salon_id: salonId,
    triggered_by: 'cron',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    emails_found: 0,
    emails_success: 0,
    emails_error: 1,
    sync_results: [
      {
        success: false,
        code: 'GMAIL_REAUTH_REQUIRED',
        error: 'Gmail authorization expired. Reconnect Gmail account.',
      },
    ],
  })
}

/**
 * Cron job to process Booksy emails
 * Runs every 15 minutes (configured in vercel.json)
 *
 * Auth: Vercel Cron Secret
 */
export async function GET(request: NextRequest) {
  try {
    const authError = validateCronSecret(request)
    if (authError) return authError

    if (isWatchFeatureEnabled()) {
      const result = await runWatchPipeline(request)
      logger.info('Booksy cron completed in watch mode', {
        action: 'booksy_cron_watch_end',
        renewedWatches: result.renewedWatches.length,
      })
      return NextResponse.json({
        success: true,
        ...result,
      })
    }

    const supabase = createAdminClient()

    const { data: salons } = await supabase
      .from('salons')
      .select(`
        id,
        slug,
        salon_settings!inner(
          booksy_enabled,
          booksy_gmail_tokens,
          booksy_sender_filter,
          booksy_sync_from_date
        )
      `)
      .eq('subscription_status', 'active')
      .eq('salon_settings.booksy_enabled', true)

    if (!salons || salons.length === 0) {
      logger.info('Booksy cron: no active salons', { action: 'booksy_cron' })
      return NextResponse.json({
        success: true,
        message: 'No active salons with Booksy enabled',
      })
    }

    logger.info('Booksy cron started', { action: 'booksy_cron_start', salons: salons.length })
    const results = []

    for (const salon of salons) {
      const settings = (salon as any).salon_settings
      if (!settings?.booksy_gmail_tokens) {
        continue
      }

      try {
        const salonSyncStart = Date.now()
        const gmailTokens = { ...(settings.booksy_gmail_tokens ?? {}) }
        const gmailClient = new GmailClient(gmailTokens, {
          onTokens: async (tokens) => {
            await supabase
              .from('salon_settings')
              .update({
                booksy_gmail_tokens: tokens,
                updated_at: new Date().toISOString(),
              })
              .eq('salon_id', salon.id)
          },
          ledger: {
            supabase,
            salonId: salon.id,
          },
        })

        const messages = await gmailClient.searchBooksyEmails(20, settings.booksy_sender_filter ?? '@booksy.com', {
          syncFromDate: settings.booksy_sync_from_date ?? null,
        })

        const processor = new BooksyProcessor(supabase, salon.id)
        const salonEmailResults: any[] = []

        for (const message of messages) {
          try {
            const result = await processor.processEmail(message.subject, message.body)
            await gmailClient.markAsProcessed(message.id, result.success)

            results.push({ salon: salon.slug, messageId: message.id, result })
            salonEmailResults.push({
              messageId: message.id,
              subject: message.subject,
              success: result.success,
              action: (result as any).action,
            })
          } catch (error: any) {
            logger.error('Booksy cron: message processing failed', error, { salonId: salon.id, messageId: message.id })
            await gmailClient.markAsProcessed(message.id, false)
            salonEmailResults.push({
              messageId: message.id,
              subject: message.subject,
              success: false,
              error: error.message,
            })
          }
        }

        const salonSuccess = salonEmailResults.filter(r => r.success).length
        supabase.from('booksy_sync_logs').insert({
          salon_id: salon.id,
          triggered_by: 'cron',
          started_at: new Date(salonSyncStart).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - salonSyncStart,
          emails_found: messages.length,
          emails_success: salonSuccess,
          emails_error: salonEmailResults.length - salonSuccess,
          sync_results: salonEmailResults,
        }).then(null, (e: any) => logger.error('Failed to save cron sync log', e, { salonId: salon.id }))
      } catch (error: any) {
        if (error?.code === 'GMAIL_REAUTH_REQUIRED' || GmailClient.isInvalidGrantError(error)) {
          logger.warn('Booksy cron: Gmail re-auth required', {
            action: 'booksy_cron_reauth',
            salonId: salon.id,
            salonSlug: salon.slug,
          })
          await saveReauthLog(supabase, salon.id)
          continue
        }
        logger.error('Booksy cron: salon processing failed', error, { salonId: salon.id, salonSlug: salon.slug })
      }
    }

    logger.info('Booksy cron completed', { action: 'booksy_cron_end', processed: results.length })
    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error: any) {
    logger.error('Booksy cron fatal error', error, { action: 'booksy_cron_fatal' })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
