import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateBookingSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled']).optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'blik']).optional(),
  surcharge: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// GET /api/bookings/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    if (error) throw error
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('GET /api/bookings/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/bookings/[id] - Update booking (status, payment, surcharge)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateBookingSchema.parse(body)

    const updateData: any = {
      updated_by: user.id,
    }

    if (validatedData.status) updateData.status = validatedData.status
    if (validatedData.paymentMethod) updateData.payment_method = validatedData.paymentMethod
    if (validatedData.surcharge !== undefined) updateData.surcharge = validatedData.surcharge
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes

    const { data: booking, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('PATCH /api/bookings/[id] error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/bookings/[id] - Cancel booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_by: user.id,
      })
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/bookings/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}