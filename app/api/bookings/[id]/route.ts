import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateBookingSchema } from '@/lib/validators/booking.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import type { Database } from '@/types/supabase'

type BookingUpdate = Database['public']['Tables']['bookings']['Update']

// GET /api/bookings/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      *,
      employee:employees(id, employee_code, first_name, last_name),
      client:clients(id, client_code, full_name, phone),
      service:services(id, name, price, duration)
    `)
    .eq('id', params.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', params.id)
    throw error
  }

  if (!booking) {
    throw new NotFoundError('Booking', params.id)
  }

  return NextResponse.json({ booking })
})

// PATCH /api/bookings/[id] - Update booking (status, payment, surcharge)
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const validatedData = updateBookingSchema.parse(body)

  // Get current version
  const { data: existingBooking, error: existingError } = await supabase
    .from('bookings')
    .select('version')
    .eq('id', params.id)
    .single()

  if (existingError || !existingBooking) {
    throw new NotFoundError('Booking', params.id)
  }

  const updateData: BookingUpdate = {
    version: (existingBooking as { version: number }).version, // Required by check_version() trigger
    updated_by: user.id,
  }

  if (validatedData.status) updateData.status = validatedData.status
  if (validatedData.paymentMethod) updateData.payment_method = validatedData.paymentMethod
  if (validatedData.surcharge !== undefined) updateData.surcharge = validatedData.surcharge
  if (validatedData.notes !== undefined) updateData.notes = validatedData.notes

  const { data: booking, error } = await (supabase as any)
    .from('bookings')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', params.id)
    throw error
  }

  return NextResponse.json({ booking })
})

// DELETE /api/bookings/[id] - Soft delete booking
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  // This will trigger the soft_delete_booking trigger
  // which sets deleted_at and deleted_by instead of actually deleting
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', params.id)

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Booking', params.id)
    throw error
  }

  return NextResponse.json({ success: true })
})
