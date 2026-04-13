import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { applyParsedEvent } from '@/lib/booksy/processor'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const APPLY_BATCH_LIMIT = 100

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization') ?? ''

  if (!secret) {
    return false
  }

  const expectedValues = [secret, `Bearer ${secret}`]

  return expectedValues.some((expected) => (
    authorization.length === expected.length &&
    timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ))
}

function resolveThreshold(eventType: string): number {
  return eventType === 'cancelled' || eventType === 'rescheduled' ? 0.92 : 0.85
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  logger.info('Booksy apply worker: run started', {
    action: 'booksy_apply_start',
    batchLimit: APPLY_BATCH_LIMIT,
  })

  const { data: pendingEvents, error } = await supabase
    .from('booksy_parsed_events')
    .select('id, salon_id, event_type, confidence_score')
    .eq('status', 'pending')
    .limit(APPLY_BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logger.info('Booksy apply worker: pending parsed events loaded', {
    action: 'booksy_apply_loaded_pending',
    pendingCount: pendingEvents?.length ?? 0,
    eventIds: (pendingEvents ?? []).map((event) => event.id),
  })

  let applied = 0
  let manual_review = 0
  let discarded = 0
  let skipped = 0
  const failures: Array<{ eventId: string; error: string }> = []

  const runStartedAt = new Date()
  const salonStats = new Map<string, { found: number; success: number; errors: number }>()
  const getSalonStats = (salonId: string) => {
    if (!salonStats.has(salonId)) salonStats.set(salonId, { found: 0, success: 0, errors: 0 })
    return salonStats.get(salonId)!
  }

  for (const event of pendingEvents ?? []) {
    getSalonStats(event.salon_id).found += 1
    const threshold = resolveThreshold(event.event_type)
    logger.info('Booksy apply worker: processing parsed event', {
      action: 'booksy_apply_processing_event',
      eventId: event.id,
      salonId: event.salon_id,
      eventType: event.event_type,
      confidenceScore: event.confidence_score,
      threshold,
    })

    if (event.confidence_score >= threshold) {
      try {
        const result = await applyParsedEvent(event.id)

        if (result?.deduplicated) {
          skipped += 1
          // Mark as applied so the event is not picked up by future apply runs.
          await supabase
            .from('booksy_parsed_events')
            .update({ status: 'applied' })
            .eq('id', event.id)
            .eq('salon_id', event.salon_id)
          logger.info('Booksy apply worker: event deduplicated by processor', {
            action: 'booksy_apply_deduplicated',
            eventId: event.id,
            salonId: event.salon_id,
          })
        } else {
          applied += 1
          getSalonStats(event.salon_id).success += 1
          logger.info('Booksy apply worker: event applied', {
            action: 'booksy_apply_applied',
            eventId: event.id,
            salonId: event.salon_id,
          })
        }
      } catch (applyError) {
        const message = applyError instanceof Error ? applyError.message : 'Unknown apply error'
        failures.push({ eventId: event.id, error: message })
        getSalonStats(event.salon_id).errors += 1
        logger.error('Booksy apply worker: failed to apply parsed event', applyError, {
          action: 'booksy_apply_failed',
          eventId: event.id,
          salonId: event.salon_id,
          error: message,
        })
        // Move to manual_review so the operator can handle it instead of leaving it stuck.
        await supabase
          .from('booksy_parsed_events')
          .update({ status: 'manual_review' })
          .eq('id', event.id)
          .eq('salon_id', event.salon_id)
      }

      continue
    }

    if (event.confidence_score >= 0.5) {
      const { error: updateError } = await supabase
        .from('booksy_parsed_events')
        .update({ status: 'manual_review' })
        .eq('id', event.id)
        .eq('salon_id', event.salon_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      manual_review += 1
      logger.info('Booksy apply worker: event moved to manual review', {
        action: 'booksy_apply_manual_review',
        eventId: event.id,
        salonId: event.salon_id,
        confidenceScore: event.confidence_score,
      })
      continue
    }

    const { error: updateError } = await supabase
      .from('booksy_parsed_events')
      .update({ status: 'discarded' })
      .eq('id', event.id)
      .eq('salon_id', event.salon_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    discarded += 1
    logger.info('Booksy apply worker: event discarded due to low confidence', {
      action: 'booksy_apply_discarded',
      eventId: event.id,
      salonId: event.salon_id,
      confidenceScore: event.confidence_score,
    })
  }

  logger.info('Booksy apply worker: run completed', {
    action: 'booksy_apply_completed',
    applied,
    manual_review,
    discarded,
    skipped,
    failureCount: failures.length,
    failures,
  })

  if (salonStats.size > 0) {
    const finishedAt = new Date()
    const logRows = Array.from(salonStats.entries()).map(([salonId, stats]) => ({
      salon_id: salonId,
      triggered_by: 'webhook',
      started_at: runStartedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - runStartedAt.getTime(),
      emails_found: stats.found,
      emails_success: stats.success,
      emails_error: stats.errors,
      sync_results: [],
    }))
    supabase.from('booksy_sync_logs').insert(logRows).then(null, (err: unknown) => {
      logger.error('Booksy apply worker: failed to insert sync logs', err, {
        action: 'booksy_apply_sync_log_failed',
      })
    })
  }

  return NextResponse.json({
    applied,
    manual_review,
    discarded,
    skipped,
    failures,
  })
}
