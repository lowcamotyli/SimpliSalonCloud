import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createBookingSchema } from '@/lib/validators/booking.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ConflictError, UnauthorizedError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// GET /api/bookings - List bookings with optional filters
export const GET = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const salonProfile = profile as any
  // Get query params
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const employeeId = searchParams.get('employeeId')
  const status = searchParams.get('status')
  const limit = searchParams.get('limit')

  let query = supabase
    .from('bookings')
    .select(`
      *,
      employee:employees(id, employee_code, first_name, last_name),
      client:clients(id, client_code, full_name, phone),
      service:services(id, name, price, duration, category)
    `)
    .eq('salon_id', salonProfile.salon_id)
    .is('deleted_at', null)
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

  const { data: bookings, error } = await query.limit(limit ? parseInt(limit) : 200)

  if (error) throw error

  const safeBookings = (bookings || []).map((booking: any) => ({
    ...booking,
    employee: booking.employee ?? {
      id: booking.employee_id,
      first_name: 'Nieznany',
      last_name: 'pracownik',
      avatar_url: null,
    },
    client: booking.client ?? {
      id: booking.client_id,
      full_name: 'Nieznany klient',
      phone: '',
    },
    service: booking.service ?? {
      id: booking.service_id,
      name: 'Usunięta usługa',
      price: 0,
      duration: booking.duration ?? 0,
      category: 'other',
    },
  }))

  return NextResponse.json({ bookings: safeBookings })
})

// POST /api/bookings - Create new booking
export const POST = withErrorHandling(async (request: NextRequest) => {
  const startTime = Date.now()
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const salonProfile = profile as any
  const body = await request.json()

  logger.info('Creating booking', {
    salonId: salonProfile.salon_id,
    userId: user.id,
    body
  })

  // Map frontend fields (employeeId -> employee_id, etc.)
  const normalizedBody = {
    ...body,
    salon_id: salonProfile.salon_id,
    employee_id: (body.employee_id || body.employeeId || '').trim() || undefined,
    service_id: (body.service_id || body.serviceId || '').trim() || undefined,
    client_id: (body.client_id || body.clientId || '').trim() || undefined,
    date: body.date || body.bookingDate,
    start_time: body.start_time || body.bookingTime,
  }

  let validatedData
  try {
    validatedData = createBookingSchema.parse(normalizedBody)
  } catch (error: any) {
    logger.error('Validation failed', error, {
      errors: error.errors,
      body: normalizedBody
    })
    throw error
  }

  // 1. Check slot availability
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id, clients(full_name)')
    .eq('employee_id', validatedData.employee_id as string)
    .eq('booking_date', validatedData.date)
    .eq('booking_time', validatedData.start_time)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existingBooking) {
    throw new ConflictError('Termin jest już zajęty', {
      conflictingClient: (existingBooking as any).clients?.full_name || 'Nieznany klient',
    })
  }

  // 2. Get or create client
  let clientId = validatedData.client_id

  if (!clientId && validatedData.clientName && validatedData.clientPhone) {
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('salon_id', salonProfile.salon_id)
      .eq('phone', validatedData.clientPhone)
      .maybeSingle()

    if (existingClient) {
      clientId = (existingClient as any).id
    } else {
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_client_code', { salon_uuid: salonProfile.salon_id } as any)

      // Fallback if RPC returns null or fails
      const clientCode = codeData || `C${Date.now().toString().slice(-6)}`

      if (codeError) {
        logger.warn('Failed to generate client code via RPC, using fallback', codeError)
      }

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          salon_id: salonProfile.salon_id,
          client_code: clientCode,
          full_name: validatedData.clientName,
          phone: validatedData.clientPhone,
          visit_count: 0
        } as any)
        .select('id')
        .single()

      if (clientError) {
        logger.error('Failed to create client', clientError, {
          code: clientError.code,
          message: clientError.message,
          hint: clientError.hint,
          details: clientError.details
        })
        throw clientError
      }
      clientId = (newClient as any).id
    }
  }

  if (!clientId) {
    throw new ValidationError('Client ID or client details required')
  }

  // 3. Get service details
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('price, duration')
    .eq('id', validatedData.service_id as string)
    .single()

  if (serviceError) throw serviceError

  // 4. Create booking
  const duration = validatedData.duration || (service as any).duration || 30

  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      salon_id: salonProfile.salon_id,
      employee_id: validatedData.employee_id as string,
      client_id: clientId,
      service_id: validatedData.service_id as string,
      booking_date: validatedData.date,
      booking_time: validatedData.start_time,
      duration: duration,
      base_price: (service as any).price,
      notes: validatedData.notes || null,
      status: (validatedData.status as any) || 'scheduled',
      created_by: user.id,
      source: (body as any).source || 'manual'
    } as any)
    .select()
    .single()

  if (bookingError) {
    logger.error('Failed to create booking', bookingError, {
      code: bookingError.code,
      message: bookingError.message,
      details: bookingError.details,
      hint: bookingError.hint
    })
    throw bookingError
  }
  if (!bookingData) throw new Error('Failed to create booking')

  const booking = bookingData as any

  // 5. Increment client visit count
  await supabase.rpc('increment_client_visits', { client_uuid: clientId } as any)

  const executionTime = Date.now() - startTime
  logger.info('Booking created successfully', {
    bookingId: booking.id,
    duration: executionTime
  })

  if (executionTime > 1000) {
    logger.warn('Slow request detected', {
      endpoint: 'POST /api/bookings',
      duration: executionTime
    })
  }

  return NextResponse.json({ booking }, { status: 201 })
})
