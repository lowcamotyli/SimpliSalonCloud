import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BooksyProcessor } from '@/lib/booksy/processor'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { logger } from '@/lib/logger'
import { Resend } from 'resend'
import { getSalonHealth } from '@/lib/booksy/health-check'

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
  logger.info('Booksy cron watch: process-notifications done', {
    action: 'booksy_cron_watch_step',
    step: 'process-notifications',
    result: processNotifications,
  })

  const parse = await postCronEndpoint(request, '/api/internal/booksy/parse')
  logger.info('Booksy cron watch: parse done', {
    action: 'booksy_cron_watch_step',
    step: 'parse',
    result: parse,
  })

  const apply = await postCronEndpoint(request, '/api/internal/booksy/apply')
  logger.info('Booksy cron watch: apply done', {
    action: 'booksy_cron_watch_step',
    step: 'apply',
    result: apply,
  })

  const reconcile = await shouldRunDailyReconciliation(supabase)
    ? await postCronEndpoint(request, '/api/internal/booksy/reconcile')
    : { skipped: true, reason: 'already-ran-today' }
  logger.info('Booksy cron watch: reconcile done', {
    action: 'booksy_cron_watch_step',
    step: 'reconcile',
    result: reconcile,
  })

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

async function sendBooksyHealthAlert(
  salonId: string,
  salonName: string,
  alertEmail: string,
  reasons: string[]
): Promise<void> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? ''
    if (!resendApiKey) {
      logger.warn('Booksy health alert skipped: RESEND_API_KEY is not configured', {
        action: 'booksy_health_alert_skipped_missing_resend_api_key',
        salonId,
        alertEmail,
      })
      return
    }

    const resend = new Resend(resendApiKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://app.simplisalon.pl'
    const settingsUrl = `${appUrl.replace(/\/+$/, '')}/settings/integrations/booksy`
    const idempotencyKey = `booksy-health-critical-${salonId}-${new Date().toISOString().slice(0, 10)}`

    const reasonItems = reasons
      .map((reason) => `<li>${reason}</li>`)
      .join('')

    await (resend.emails.send as any)(
      {
        from: 'SimpliSalon <noreply@simplisalon.pl>',
        to: [alertEmail],
        subject: `⚠️ Booksy — problem z integracją: ${salonName}`,
        html: `
          <p>Wykryto krytyczny problem z integracją Booksy dla salonu <strong>${salonName}</strong>.</p>
          <p>Powody:</p>
          <ul>${reasonItems}</ul>
          <p>Sprawdź ustawienia integracji: <a href="${settingsUrl}">${settingsUrl}</a></p>
        `,
      },
      {
        idempotencyKey,
      }
    )

    logger.info('Booksy health alert email sent', {
      action: 'booksy_health_alert_sent',
      salonId,
      alertEmail,
      reasonsCount: reasons.length,
      idempotencyKey,
    })
  } catch (error: any) {
    logger.error('Booksy health alert email failed', error, {
      action: 'booksy_health_alert_failed',
      salonId,
      alertEmail,
    })
  }
}

async function checkAndAlertSalonHealth(
  salonId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<void> {
  const { data: settingsRow, error: settingsError } = await supabase
    .from('salon_settings')
    .select('booksy_notify_email')
    .eq('salon_id', salonId)
    .maybeSingle<{ booksy_notify_email: string | null }>()

  if (settingsError) {
    throw settingsError
  }

  const { data: salonRow, error: salonError } = await supabase
    .from('salons')
    .select('name, owner_email')
    .eq('id', salonId)
    .maybeSingle<{ name: string | null; owner_email: string | null }>()

  if (salonError) {
    throw salonError
  }

  const alertEmail = settingsRow?.booksy_notify_email ?? salonRow?.owner_email ?? null

  if (!alertEmail) {
    logger.warn('Booksy health alert skipped: missing alert email', {
      action: 'booksy_health_alert_no_email',
      salonId,
    })
    return
  }

  const health = await getSalonHealth(salonId, supabase)
  if (health.overall !== 'critical') {
    return
  }

  const nowMs = Date.now()
  const reasons: string[] = []

  for (const mailbox of health.mailboxes) {
    if (mailbox.authStatus === 'revoked' || mailbox.authStatus === 'expired') {
      reasons.push(`${mailbox.email}: autoryzacja Gmail ma status "${mailbox.authStatus}"`)
    }

    if (mailbox.watchStatus !== 'active') {
      reasons.push(`${mailbox.email}: watch ma status "${mailbox.watchStatus ?? 'brak'}"`)
    }

    if (mailbox.lastNotificationAt) {
      const lastNotificationMs = new Date(mailbox.lastNotificationAt).getTime()
      if (Number.isFinite(lastNotificationMs) && nowMs - lastNotificationMs > 30 * 60 * 1000) {
        reasons.push(`${mailbox.email}: brak powiadomień Gmail od ponad 30 minut`)
      }
    }
  }

  const uniqueReasons = Array.from(new Set(reasons))
  if (uniqueReasons.length === 0) {
    uniqueReasons.push('Stan integracji oznaczony jako krytyczny')
  }

  await sendBooksyHealthAlert(
    salonId,
    salonRow?.name?.trim() || `Salon ${salonId}`,
    alertEmail,
    uniqueReasons
  )
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
      try {
        const supabase = createAdminClient()
        const { data: activeAccounts, error: activeAccountsError } = await supabase
          .from('booksy_gmail_accounts')
          .select('salon_id')
          .eq('is_active', true)

        if (activeAccountsError) {
          throw activeAccountsError
        }

        const salonIds = Array.from(new Set(
          (activeAccounts ?? [])
            .map((row): string | null => (typeof row.salon_id === 'string' && row.salon_id.length > 0 ? row.salon_id : null))
            .filter((id): id is string => id !== null)
        ))

        for (const salonId of salonIds) {
          await checkAndAlertSalonHealth(salonId, supabase)
        }
      } catch (alertError: any) {
        logger.error('Booksy cron watch mode: health alerting failed', alertError, {
          action: 'booksy_cron_watch_health_alert_failed',
        })
      }
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
    const processedSalonIds = new Set<string>()

    for (const salon of salons) {
      const settings = (salon as any).salon_settings
      if (!settings?.booksy_gmail_tokens) {
        continue
      }
      processedSalonIds.add(salon.id)

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

    try {
      for (const salonId of processedSalonIds) {
        await checkAndAlertSalonHealth(salonId, supabase)
      }
    } catch (alertError: any) {
      logger.error('Booksy cron polling mode: health alerting failed', alertError, {
        action: 'booksy_cron_polling_health_alert_failed',
      })
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
