import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createBookingSchema = z.object({
  employeeId: z.string().uuid('Nieprawidłowy ID pracownika'),
  clientId: z.string().uuid('Nieprawidłowy ID klienta').optional(),
  clientName: z.string().min(2, 'Imię klienta: minimum 2 znaki').optional(),
  clientPhone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr').optional(),
  serviceId: z.string().uuid('Nieprawidłowy ID usługi'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: YYYY-MM-DD'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Godzina: HH:mm'),
  duration: z.number().int().min(15).max(480),
  notes: z.string().optional(),
  source: z.enum(['manual', 'booksy', 'api']).default('manual'),
})

// GET /api/bookings - List bookings with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')

    let query = supabase
      .from('bookings')
      .select(`
        *,
        employee:employees(id, employee_code, first_name, last_name),
        client:clients(id, client_code, full_name, phone),
        service:services(id, name, price, duration)
      `)
      .eq('salon_id', profile.salon_id)
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false })

    if (startDate) {
      query = query.gte('booking_date', startDate)
    }
    if (endDate) {
      query = query.lte('booking_date', endDate)
    }
    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: bookings, error } = await query.limit(200)

    if (error) throw error

    return NextResponse.json({ bookings })
  } catch (error: any) {
    console.error('GET /api/bookings error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/bookings - Create new booking
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = createBookingSchema.parse(body)

    // 1. Check slot availability
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, clients(full_name)')
      .eq('employee_id', validatedData.employeeId)
      .eq('booking_date', validatedData.bookingDate)
      .eq('booking_time', validatedData.bookingTime)
      .neq('status', 'cancelled')
      .single()

    if (existingBooking) {
      return NextResponse.json(
        {
          error: 'Termin jest już zajęty',
          // @ts-ignore
          conflictingClient: existingBooking.clients?.full_name || 'Nieznany klient',
        },
        { status: 409 }
      )
    }

    // 2. Get or create client
    let clientId = validatedData.clientId

    if (!clientId && validatedData.clientName && validatedData.clientPhone) {
      // Check if client exists by phone
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('salon_id', profile.salon_id)
        .eq('phone', validatedData.clientPhone)
        .single()

      if (existingClient) {
        clientId = existingClient.id
      } else {
        // Create new client
        const { data: codeData } = await supabase
          .rpc('generate_client_code', { salon_uuid: profile.salon_id })

        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            salon_id: profile.salon_id,
            client_code: codeData,
            full_name: validatedData.clientName,
            phone: validatedData.clientPhone,
          })
          .select('id')
          .single()

        if (clientError) throw clientError
        clientId = newClient.id
      }
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID or client details required' },
        { status: 400 }
      )
    }

    // 3. Get service price
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('price')
      .eq('id', validatedData.serviceId)
      .single()

    if (serviceError) throw serviceError

    // 4. Create booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        salon_id: profile.salon_id,
        employee_id: validatedData.employeeId,
        client_id: clientId,
        service_id: validatedData.serviceId,
        booking_date: validatedData.bookingDate,
        booking_time: validatedData.bookingTime,
        duration: validatedData.duration,
        base_price: service.price,
        notes: validatedData.notes || null,
        source: validatedData.source,
        status: 'scheduled',
        created_by: user.id,
      })
      .select()
      .single()

    if (bookingError) throw bookingError

    // 5. Increment client visit count
    await supabase.rpc('increment_client_visits', { client_uuid: clientId })

    return NextResponse.json({ booking }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/bookings error:', error)

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