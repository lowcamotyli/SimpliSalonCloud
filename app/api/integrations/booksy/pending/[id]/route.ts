import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError, NotFoundError, ValidationError } from '@/lib/errors'

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

  // Fetch the pending email, enforcing salon ownership
  const { data: pendingRow, error: fetchError } = await (supabase as any).from('booksy_pending_emails')
    .select('*')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (fetchError || !pendingRow) {
    throw new NotFoundError('Pending email')
  }

  if (pendingRow.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: 'Email is already processed (not in pending status)' },
      { status: 400 }
    )
  }

  const parsed = pendingRow.parsed_data as Record<string, any>

  if (!parsed) {
    return NextResponse.json(
      { success: false, error: 'Cannot retry: parsed_data is missing from the pending record' },
      { status: 400 }
    )
  }

  try {
    // 1. Resolve service — use override if provided, otherwise fail (no automatic fuzzy lookup)
    let service: Record<string, any> | null = null
    if (serviceId) {
      const { data, error: svcError } = await (admin.from('services') as any)
        .select('*')
        .eq('id', serviceId)
        .eq('salon_id', salonId)
        .single()
      if (svcError || !data) {
        return NextResponse.json(
          { success: false, error: `Service with id "${serviceId}" not found in this salon` },
          { status: 400 }
        )
      }
      service = data
    }

    // 2. Resolve employee — use override if provided
    let employee: Record<string, any> | null = null
    if (employeeId) {
      const { data, error: empError } = await (admin.from('employees') as any)
        .select('*')
        .eq('id', employeeId)
        .eq('salon_id', salonId)
        .single()
      if (empError || !data) {
        return NextResponse.json(
          { success: false, error: `Employee with id "${employeeId}" not found in this salon` },
          { status: 400 }
        )
      }
      employee = data
    }

    // 3. Find or create client by phone number
    let client: Record<string, any> | null = null

    const { data: existingClient } = await (admin.from('clients') as any)
      .select('*')
      .eq('salon_id', salonId)
      .eq('phone', parsed.clientPhone)
      .maybeSingle()

    if (existingClient) {
      client = existingClient
    } else {
      const { data: codeData } = await (admin as any).rpc('generate_client_code', { salon_uuid: salonId })
      const clientCode = codeData || `B${Date.now().toString().slice(-6)}`

      const { data: newClient, error: clientError } = await (admin.from('clients') as any)
        .insert({
          salon_id: salonId,
          client_code: clientCode,
          full_name: parsed.clientName || 'Nieznany klient',
          phone: parsed.clientPhone || null,
          email: parsed.clientEmail || null,
          visit_count: 0,
        })
        .select()
        .single()

      if (clientError) throw clientError
      client = newClient
    }

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to resolve or create client' },
        { status: 500 }
      )
    }

    // 4. Create the booking
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
        notes: `[booksy_retry] message_id:${pendingRow.message_id}`,
        status: 'scheduled',
        source: 'booksy',
      })
      .select()
      .single()

    if (bookingError) throw bookingError

    // 5. Mark the pending email as resolved
    await (admin as any).from('booksy_pending_emails')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, booking })

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 })
  }
})
