import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError, NotFoundError, ValidationError } from '@/lib/errors'

type PendingEmailLike = {
  id: string
  source: 'pending_email' | 'manual_review'
  status: string
  message_id: string
  subject: string | null
  parsed_data: Record<string, any> | null
}

async function loadPendingEmailOrManualReview(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  salonId: string,
  id: string
): Promise<PendingEmailLike | null> {
  const { data: pendingRow, error: pendingError } = await (supabase as any).from('booksy_pending_emails')
    .select('*')
    .eq('id', id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (pendingError) throw pendingError
  if (pendingRow) {
    return {
      ...pendingRow,
      source: 'pending_email',
      parsed_data: pendingRow.parsed_data ?? null,
    }
  }

  const { data: parsedEvent, error: parsedEventError } = await (supabase as any).from('booksy_parsed_events')
    .select('id, status, payload')
    .eq('id', id)
    .eq('salon_id', salonId)
    .eq('status', 'manual_review')
    .maybeSingle()

  if (parsedEventError) throw parsedEventError
  if (!parsedEvent) {
    return null
  }

  return {
    id: parsedEvent.id,
    source: 'manual_review',
    status: parsedEvent.status,
    message_id: parsedEvent.id,
    subject: parsedEvent.payload?.raw?.subject ?? null,
    parsed_data: parsedEvent.payload?.parsed ?? null,
  }
}

async function createBookingFromParsedData(
  admin: ReturnType<typeof createAdminClient>,
  salonId: string,
  parsed: Record<string, any>,
  messageId: string,
  serviceId?: string,
  employeeId?: string
) {
  let service: Record<string, any> | null = null
  if (serviceId) {
    const { data, error: svcError } = await (admin.from('services') as any)
      .select('*')
      .eq('id', serviceId)
      .eq('salon_id', salonId)
      .single()
    if (svcError || !data) {
      throw new Error(`Service with id "${serviceId}" not found in this salon`)
    }
    service = data
  }

  let employee: Record<string, any> | null = null
  if (employeeId) {
    const { data, error: empError } = await (admin.from('employees') as any)
      .select('*')
      .eq('id', employeeId)
      .eq('salon_id', salonId)
      .single()
    if (empError || !data) {
      throw new Error(`Employee with id "${employeeId}" not found in this salon`)
    }
    employee = data
  }

  const clientName = (parsed.clientName || '').trim()
  if (clientName.length < 2) {
    throw new Error('Cannot create client: invalid or missing client name in parsed data')
  }

  let client: Record<string, any> | null = null

  if (parsed.clientPhone) {
    const { data: existingByPhone } = await (admin.from('clients') as any)
      .select('*')
      .eq('salon_id', salonId)
      .eq('phone', parsed.clientPhone)
      .maybeSingle()
    if (existingByPhone) client = existingByPhone
  }

  if (!client) {
    const { data: existingByName } = await (admin.from('clients') as any)
      .select('*')
      .eq('salon_id', salonId)
      .ilike('full_name', clientName)
      .maybeSingle()
    if (existingByName) client = existingByName
  }

  if (!client) {
    const { data: codeData } = await (admin as any).rpc('generate_client_code', { salon_uuid: salonId })
    const clientCode = codeData || `BK${Date.now().toString(36).toUpperCase().slice(-6)}`

    const { data: newClient, error: clientError } = await (admin.from('clients') as any)
      .insert({
        salon_id: salonId,
        client_code: clientCode,
        full_name: clientName,
        phone: parsed.clientPhone || '',
        email: parsed.clientEmail || null,
        visit_count: 0,
      })
      .select()
      .single()

    if (clientError) {
      const isClientCodeConflict =
        clientError.code === '23505' &&
        (clientError.constraint === 'clients_salon_id_client_code_key' ||
          String(clientError.message || '').includes('clients_salon_id_client_code_key'))

      if (!isClientCodeConflict) throw clientError

      const fallbackClientCode = `BK${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
      const { data: retriedClient, error: retryClientError } = await (admin.from('clients') as any)
        .insert({
          salon_id: salonId,
          client_code: fallbackClientCode,
          full_name: clientName,
          phone: parsed.clientPhone || '',
          email: parsed.clientEmail || null,
          visit_count: 0,
        })
        .select()
        .single()

      if (retryClientError) throw retryClientError
      client = retriedClient
    } else {
      client = newClient
    }
  }

  if (!client) {
    throw new Error('Failed to resolve or create client')
  }

  const duration = parsed.duration || service?.duration || 30
  const basePrice = parsed.price || service?.price || 0

  const { data: booking, error: bookingError } = await (admin.from('bookings') as any)
    .insert({
      salon_id: salonId,
      client_id: client.id,
      employee_id: employee?.id || null,
      service_id: service?.id || null,
      booking_date: parsed.bookingDate,
      booking_time: parsed.bookingTime,
      duration,
      base_price: basePrice,
      notes: `[booksy_retry] message_id:${messageId}`,
      status: 'scheduled',
      source: 'booksy',
    })
    .select()
    .single()

  if (bookingError) throw bookingError
  return booking
}

// PATCH /api/integrations/booksy/pending/[id]
// Body: { status: 'resolved' | 'ignored' }
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
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

  const body = await request.json()
  const { status } = body

  if (!['resolved', 'ignored'].includes(status)) {
    throw new ValidationError('Invalid status. Must be "resolved" or "ignored".')
  }

  const row = await loadPendingEmailOrManualReview(supabase, profile.salon_id, id)
  if (!row) throw new NotFoundError('Pending email')

  if (row.source === 'pending_email') {
    const updateData: Record<string, unknown> = { status }
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString()
    }

    const { data: updatedRow, error } = await (supabase as any).from('booksy_pending_emails')
      .update(updateData)
      .eq('id', id)
      .eq('salon_id', profile.salon_id)
      .select()
      .single()

    if (error) throw error
    if (!updatedRow) throw new NotFoundError('Pending email')

    return NextResponse.json({ success: true, pending: updatedRow })
  }

  const targetStatus = status === 'ignored' ? 'discarded' : 'applied'
  const { error } = await (supabase as any).from('booksy_parsed_events')
    .update({ status: targetStatus })
    .eq('id', id)
    .eq('salon_id', profile.salon_id)

  if (error) throw error

  return NextResponse.json({ success: true, pending: { id, status: targetStatus, source: 'manual_review' } })
})

// POST /api/integrations/booksy/pending/[id]
// Body: { serviceId?: string, employeeId?: string }
// Manual retry: creates a booking using the stored parsed_data with optional overrides
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
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

  const salonId: string = profile.salon_id
  const admin = createAdminClient()

  const body = await request.json()
  const { serviceId, employeeId } = body as { serviceId?: string; employeeId?: string }

  const row = await loadPendingEmailOrManualReview(supabase, salonId, id)
  if (!row) {
    throw new NotFoundError('Pending email')
  }

  if (row.status !== 'pending' && row.status !== 'manual_review') {
    return NextResponse.json(
      { success: false, error: 'Email is already processed (not in pending status)' },
      { status: 400 }
    )
  }

  const parsed = row.parsed_data as Record<string, any>

  if (!parsed) {
    return NextResponse.json(
      { success: false, error: 'Cannot retry: parsed_data is missing from the pending record' },
      { status: 400 }
    )
  }

  try {
    const booking = await createBookingFromParsedData(
      admin,
      salonId,
      parsed,
      row.message_id,
      serviceId,
      employeeId
    )

    if (row.source === 'pending_email') {
      await (admin as any).from('booksy_pending_emails')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', id)
    } else {
      await (admin as any).from('booksy_parsed_events')
        .update({ status: 'applied' })
        .eq('id', id)
        .eq('salon_id', salonId)
    }

    return NextResponse.json({ success: true, booking })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 })
  }
})
