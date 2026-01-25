import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const checkAvailabilitySchema = z.object({
  employeeId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/),
})

// POST /api/bookings/check-availability
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeId, bookingDate, bookingTime } = checkAvailabilitySchema.parse(body)

    // Check if slot is taken
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, clients(full_name)')
      .eq('employee_id', employeeId)
      .eq('booking_date', bookingDate)
      .eq('booking_time', bookingTime)
      .neq('status', 'cancelled')
      .single()

    if (existingBooking) {
      return NextResponse.json({
        available: false,
        // @ts-ignore
        conflictingClient: existingBooking.clients?.full_name || 'Nieznany klient',
      })
    }

    return NextResponse.json({ available: true })
  } catch (error: any) {
    console.error('POST /api/bookings/check-availability error:', error)

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