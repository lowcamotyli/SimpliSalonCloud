import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type ManualReviewRow = {
  id: string
  event_type: string
  review_reason: string | null
  review_detail: string | null
  candidate_bookings: unknown
  payload: { parsed?: unknown } | null
  created_at: string
}

export const GET = withErrorHandling(async () => {
  const { supabase, salonId } = await getAuthContext()

  const { data, error } = await (supabase.from('booksy_parsed_events') as any)
    .select('id, event_type, review_reason, review_detail, candidate_bookings, payload, created_at')
    .eq('salon_id', salonId)
    .eq('status', 'manual_review')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  const rows: ManualReviewRow[] = (data ?? []) as ManualReviewRow[]

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      review_reason: row.review_reason,
      review_detail: row.review_detail,
      candidate_bookings: row.candidate_bookings,
      parsed: row.payload?.parsed ?? null,
      created_at: row.created_at,
    }))
  )
})

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()
  const body = await request.json().catch(() => ({}))

  const parsedEventId = typeof body?.parsedEventId === 'string' ? body.parsedEventId : ''
  const action = typeof body?.action === 'string' ? body.action : ''

  if (!parsedEventId) {
    throw new ValidationError('parsedEventId is required')
  }

  if (action !== 'discard') {
    throw new ValidationError('action must be "discard"')
  }

  const { data, error } = await (supabase.from('booksy_parsed_events') as any)
    .update({ status: 'discarded' })
    .eq('id', parsedEventId)
    .eq('salon_id', salonId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data?.id) {
    throw new NotFoundError('booksy_parsed_event', parsedEventId)
  }

  return NextResponse.json({ success: true })
})
