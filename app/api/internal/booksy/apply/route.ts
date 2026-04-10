import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { TablesInsert } from '@/types/supabase'

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

function buildIdempotencyKey(salonId: string, eventFingerprint: string): string {
  return createHash('sha256')
    .update(`${salonId}|${eventFingerprint}`)
    .digest('hex')
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
  const { data: pendingEvents, error } = await supabase
    .from('booksy_parsed_events')
    .select('id, salon_id, event_fingerprint, event_type, confidence_score')
    .eq('status', 'pending')
    .limit(APPLY_BATCH_LIMIT)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let applied = 0
  let manual_review = 0
  let discarded = 0
  let skipped = 0

  for (const event of pendingEvents ?? []) {
    const threshold = resolveThreshold(event.event_type)

    if (event.confidence_score >= threshold) {
      const idempotencyKey = buildIdempotencyKey(event.salon_id, event.event_fingerprint)
      const ledgerPayload: TablesInsert<'booksy_apply_ledger'> = {
        salon_id: event.salon_id,
        booksy_parsed_event_id: event.id,
        idempotency_key: idempotencyKey,
        target_table: 'appointments',
        operation: 'updated',
      }

      const { data: insertedLedger, error: ledgerError } = await supabase
        .from('booksy_apply_ledger')
        .upsert(ledgerPayload, {
          onConflict: 'idempotency_key',
          ignoreDuplicates: true,
        })
        .select('id')

      if (ledgerError) {
        return NextResponse.json({ error: ledgerError.message }, { status: 500 })
      }

      if ((insertedLedger?.length ?? 0) === 0) {
        skipped += 1
        continue
      }

      const { error: updateError } = await supabase
        .from('booksy_parsed_events')
        .update({ status: 'applied' })
        .eq('id', event.id)
        .eq('salon_id', event.salon_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      applied += 1
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
  }

  return NextResponse.json({ applied, manual_review, discarded, skipped })
}
