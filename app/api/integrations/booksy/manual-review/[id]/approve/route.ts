import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { applyParsedEvent } from '@/lib/booksy/processor'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

type ApproveRequestBody = {
  bookingId?: string
  employeeId?: string
}

export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  if (!id) {
    throw new ValidationError('id is required')
  }

  const body = await request.json().catch(() => ({})) as ApproveRequestBody
  const bookingId = typeof body.bookingId === 'string' && body.bookingId.trim().length > 0
    ? body.bookingId.trim()
    : undefined
  const employeeId = typeof body.employeeId === 'string' && body.employeeId.trim().length > 0
    ? body.employeeId.trim()
    : undefined

  const { supabase, salonId } = await getAuthContext()

  const { data: event } = await (supabase.from('booksy_parsed_events') as any)
    .select('id, status, event_fingerprint')
    .eq('id', id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (!event?.id) {
    throw new NotFoundError('booksy_parsed_event', id)
  }

  // Reset any 'skipped' ledger entry so the processor doesn't short-circuit
  // via idempotency check and actually re-applies the event.
  const adminSupabase = createAdminSupabaseClient()
  await (adminSupabase.from('booksy_apply_ledger') as any)
    .update({ operation: 'failed' })
    .eq('booksy_parsed_event_id', id)
    .eq('salon_id', salonId)
    .eq('operation', 'skipped')

  const result = await applyParsedEvent(id, { bookingId, employeeId })

  // If processor still returns manual_review (ambiguous match without bookingId override),
  // force-mark the event as applied so it leaves the queue — user explicitly approved.
  const stillManualReview = result && typeof result === 'object' && 'manualReview' in result && result.manualReview
  if (stillManualReview) {
    await (adminSupabase.from('booksy_parsed_events') as any)
      .update({ status: 'applied' })
      .eq('id', id)
      .eq('salon_id', salonId)
  }

  return NextResponse.json({ success: true, result })
})
