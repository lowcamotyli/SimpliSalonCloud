import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, hasSupabaseSessionCookie } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError, NotFoundError } from '@/lib/errors'

type PendingEmailResponseRow = {
  id: string
  source: 'pending_email' | 'manual_review'
  message_id: string
  subject: string | null
  body_snippet: string | null
  parsed_data: {
    clientName?: string
    clientPhone?: string
    clientEmail?: string
    serviceName?: string
    employeeName?: string
    price?: number
    bookingDate?: string
    bookingTime?: string
    duration?: number
  } | null
  failure_reason: 'parse_failed' | 'service_not_found' | 'employee_not_found' | 'cancel_not_found' | 'reschedule_not_found' | 'other'
  failure_detail: string | null
  status: 'pending' | 'resolved' | 'ignored'
  created_at: string
}

type FailureReason = PendingEmailResponseRow['failure_reason']

function mapApplyErrorToFailureReason(message: string | null | undefined): FailureReason {
  const normalized = (message ?? '').toLowerCase()

  if (normalized.includes('service not found')) {
    return 'service_not_found'
  }

  if (normalized.includes('employee not found')) {
    return 'employee_not_found'
  }

  if (normalized.includes('booking to cancel not found')) {
    return 'cancel_not_found'
  }

  if (normalized.includes('booking to reschedule not found')) {
    return 'reschedule_not_found'
  }

  if (normalized.includes('parse') || normalized.includes('parsed_data')) {
    return 'parse_failed'
  }

  return 'other'
}

// GET /api/integrations/booksy/pending
// Query params: ?status=pending|resolved|ignored|all (default: 'pending')
export const GET = withErrorHandling(async (request: NextRequest) => {
  if (!(await hasSupabaseSessionCookie())) {
    throw new UnauthorizedError()
  }

  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await (supabase.from('profiles') as any)
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.salon_id) {
    throw new NotFoundError('Profile')
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

  let query = (supabase as any).from('booksy_pending_emails')
    .select('*')
    .eq('salon_id', profile.salon_id)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: rows, error } = await query
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  const mappedPendingRows: PendingEmailResponseRow[] = (rows || []).map((row: any) => ({
    ...row,
    source: 'pending_email',
  }))

  let manualReviewRows: PendingEmailResponseRow[] = []
  if (status === 'pending' || status === 'all') {
    const { data: manualReviewEvents, error: manualReviewError } = await (supabase as any)
      .from('booksy_parsed_events')
      .select('id, created_at, event_type, confidence_score, payload')
      .eq('salon_id', profile.salon_id)
      .eq('status', 'manual_review')
      .order('created_at', { ascending: false })
      .limit(50)

    if (manualReviewError) throw manualReviewError

    const manualReviewIds = (manualReviewEvents || []).map((event: any) => event.id)
    let applyErrorsByEventId = new Map<string, string>()

    if (manualReviewIds.length > 0) {
      const { data: applyLedgerRows, error: applyLedgerError } = await (supabase as any)
        .from('booksy_apply_ledger')
        .select('booksy_parsed_event_id, error_message, applied_at')
        .eq('salon_id', profile.salon_id)
        .eq('operation', 'failed')
        .in('booksy_parsed_event_id', manualReviewIds)
        .order('applied_at', { ascending: false })

      if (applyLedgerError) throw applyLedgerError

      applyErrorsByEventId = new Map(
        (applyLedgerRows || [])
          .filter((row: any) => row.booksy_parsed_event_id && row.error_message)
          .map((row: any) => [row.booksy_parsed_event_id, row.error_message])
      )
    }

    manualReviewRows = (manualReviewEvents || []).map((event: any) => {
      const parsed = event.payload?.parsed ?? null
      const raw = event.payload?.raw ?? null
      const applyError = applyErrorsByEventId.get(event.id) ?? null
      const fallbackDetail = `Wymaga recznej weryfikacji (confidence ${Number(event.confidence_score ?? 0).toFixed(2)})`

      return {
        id: event.id,
        source: 'manual_review',
        message_id: raw?.storagePath ?? `parsed-event:${event.id}`,
        subject: raw?.subject ?? null,
        body_snippet: null,
        parsed_data: parsed,
        failure_reason: mapApplyErrorToFailureReason(applyError),
        failure_detail: applyError ?? fallbackDetail,
        status: 'pending',
        created_at: event.created_at,
      }
    })
  }

  const merged = [...mappedPendingRows, ...manualReviewRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)

  return NextResponse.json({
    pending: merged,
    count: merged.length,
  })
})
