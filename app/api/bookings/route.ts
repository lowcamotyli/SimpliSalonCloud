import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createBookingSchema } from '@/lib/validators/booking.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { ConflictError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { checkEquipmentAvailability, getRequiredEquipmentForService } from '@/lib/equipment/availability'
import { generateFormToken } from '@/lib/forms/token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/messaging/email-sender'

// GET /api/bookings - List bookings with optional filters
export const GET = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request)
  if (rl) return rl

  const { supabase, salonId } = await getAuthContext()

  // Get query params
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const employeeId = searchParams.get('employeeId')
  const status = searchParams.get('status')
  const limit = searchParams.get('limit')
  const visitGroupId = searchParams.get('visitGroupId')

  let query = supabase
    .from('bookings')
    .select(`
      *,
      employee:employees(id, employee_code, first_name, last_name),
      client:clients(id, client_code, full_name, phone),
      service:services(id, name, price, duration, category),
      visit_group:visit_groups(id, total_price, total_duration, status, payment_method)
    `)
    .eq('salon_id', salonId)
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
  if (visitGroupId) {
    query = query.eq('visit_group_id', visitGroupId)
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
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl

  const startTime = Date.now()
  const { supabase, user, salonId } = await getAuthContext()

  const body = await request.json()

  logger.info('Creating booking', {
    salonId: salonId,
    userId: user.id,
    body
  })

  // Map frontend fields (employeeId -> employee_id, etc.)
  const normalizedBody = {
    ...body,
    salon_id: salonId,
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

  // 1. Get or create client
  let clientId = validatedData.client_id
  let bookingWarning: string | null = null

  if (!clientId && validatedData.clientName && validatedData.clientPhone) {
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, blacklist_status')
      .eq('salon_id', salonId)
      .eq('phone', validatedData.clientPhone)
      .maybeSingle()

    if (existingClient) {
      clientId = (existingClient as any).id
      if ((existingClient as any).blacklist_status === 'blacklisted') {
        bookingWarning = 'Ten klient jest na czarnej liscie. Wizyte mozna dodac tylko po decyzji recepcji.'
      }
    } else {
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_client_code', { salon_uuid: salonId } as any)

      // Fallback if RPC returns null or fails
      const clientCode = codeData || `C${Date.now().toString().slice(-6)}`

      if (codeError) {
        logger.warn('Failed to generate client code via RPC, using fallback', { error: codeError })
      }

      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          salon_id: salonId,
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

  if (clientId && !bookingWarning) {
    const { data: selectedClient, error: clientLookupError } = await supabase
      .from('clients')
      .select('id, blacklist_status')
      .eq('id', clientId)
      .eq('salon_id', salonId)
      .is('deleted_at', null)
      .maybeSingle()

    if (clientLookupError) throw clientLookupError
    if (!selectedClient) throw new ValidationError('Client not found in this salon')

    if ((selectedClient as any).blacklist_status === 'blacklisted') {
      bookingWarning = 'Ten klient jest na czarnej liscie. Wizyte mozna dodac tylko po decyzji recepcji.'
    }
  }

  // 2. Get service details
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('price, duration')
    .eq('id', validatedData.service_id as string)
    .single()

  if (serviceError) throw serviceError

  const { count: serviceAssignmentCount, error: assignmentCountError } = await supabase
    .from('employee_services')
    .select('*', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .eq('service_id', validatedData.service_id as string)

  if (assignmentCountError) throw assignmentCountError

  if ((serviceAssignmentCount ?? 0) > 0) {
    const { data: employeeService, error: employeeServiceError } = await supabase
      .from('employee_services')
      .select('id')
      .eq('salon_id', salonId)
      .eq('employee_id', validatedData.employee_id as string)
      .eq('service_id', validatedData.service_id as string)
      .maybeSingle()

    if (employeeServiceError) throw employeeServiceError

    if (!employeeService) {
      return NextResponse.json(
        { error: 'Employee is not authorized to perform this service' },
        { status: 400 }
      )
    }
  }

  // 3. Check equipment availability for the service
  const duration = validatedData.duration || (service as any).duration || 30
  const startsAt = new Date(`${validatedData.date}T${validatedData.start_time}:00Z`)
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)
  const requiredEquipment = await getRequiredEquipmentForService(validatedData.service_id as string)
  if (requiredEquipment.length > 0) {
    const availability = await checkEquipmentAvailability(requiredEquipment, startsAt, endsAt)
    const conflicts = availability.filter(a => !a.is_available)
    if (conflicts.length > 0) {
      return NextResponse.json({
        error: 'EQUIPMENT_CONFLICT',
        message: 'Wybrany termin jest niedostepny – sprzet jest juz zajety.',
        conflictingEquipment: conflicts.map(c => c.equipment_id),
      }, { status: 409 })
    }
  }

  // 4. Atomically check slot + create booking (eliminates race condition)

  const { data: bookingRows, error: bookingError } = await (supabase as any)
    .rpc('create_booking_atomic', {
      p_salon_id: salonId,
      p_employee_id: validatedData.employee_id as string,
      p_client_id: clientId,
      p_service_id: validatedData.service_id as string,
      p_booking_date: validatedData.date,
      p_booking_time: validatedData.start_time,
      p_duration: duration,
      p_base_price: (service as any).price,
      p_notes: validatedData.notes || null,
      p_status: (validatedData.status as any) || 'scheduled',
      p_created_by: user.id,
      p_source: (body as any).source || 'manual',
    } as any)

  if (bookingError) {
    if (bookingError.code === '23P01') {
      throw new ConflictError('Wybrany termin jest juz zajety. Wybierz inna godzine lub pracownika.')
    }
    logger.error('Failed to create booking', bookingError, {
      code: bookingError.code,
      message: bookingError.message,
    })
    throw bookingError
  }

  const bookingData = Array.isArray(bookingRows) ? bookingRows[0] : bookingRows
  if (!bookingData) throw new Error('Failed to create booking')

  const booking = bookingData as any

  // 5. Create equipment bookings
  if (requiredEquipment.length > 0) {
    await supabase.from('equipment_bookings').insert(
      requiredEquipment.map(eqId => ({
        booking_id: booking.id,
        equipment_id: eqId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      }))
    )
  }

  // 6. Increment client visit count
  await supabase.rpc('increment_client_visits', { client_uuid: clientId } as any)

  // 7. Send form links for service forms (fire-and-forget, non-blocking)
  void sendFormLinksForBooking({
    booking,
    salonId: salonId,
    clientId,
    serviceId: validatedData.service_id as string,
  }).catch(err => logger.warn('Form link dispatch failed', err))

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

  return NextResponse.json({ booking, warning: bookingWarning }, { status: 201 })
})

async function sendFormLinksForBooking({
  booking, salonId, clientId, serviceId,
}: { booking: any; salonId: string; clientId: string; serviceId: string }) {
  const adminSupabase = createAdminSupabaseClient()

  const { data: serviceFormRows } = await adminSupabase
    .from("service_forms")
    .select("form_template_id")
    .eq("service_id", serviceId)

  if (!serviceFormRows || serviceFormRows.length === 0) return

  const { data: client } = await adminSupabase
    .from("clients").select("email, full_name").eq("id", clientId).single()

  const fillTokenExp = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""

  for (const row of serviceFormRows) {
    const token = await generateFormToken({
      formTemplateId: (row as any).form_template_id,
      clientId,
      bookingId: booking.id,
      salonId,
    })

    const { data: template } = await adminSupabase
      .from("form_templates")
      .select("name")
      .eq("id", (row as any).form_template_id)
      .single()

    await adminSupabase.from("client_forms").insert({
      client_id: clientId,
      booking_id: booking.id,
      form_template_id: (row as any).form_template_id,
      answers: Buffer.from("{}").toString("hex"),
      answers_iv: Buffer.alloc(12).toString("hex"),
      answers_tag: Buffer.alloc(16).toString("hex"),
      fill_token: token,
      fill_token_exp: fillTokenExp,
    } as any)

    const clientEmail = (client as any)?.email
    if (clientEmail) {
      const clientName = (client as any)?.full_name || 'Kliencie'
      const formName = (template as any)?.name || 'formularz'
      const formUrl = `${appUrl}/forms/fill/${token}`
      await sendTransactionalEmail({
        salonId,
        to: clientEmail,
        subject: `Prosimy o wypełnienie formularza przed wizytą`,
        html: `<p>Drogi/Droga ${clientName},</p>
<p>Przed nadchodzącą wizytą prosimy o wypełnienie formularza <strong>${formName}</strong>.</p>
<p><a href="${formUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Wypełnij formularz</a></p>
<p>Link jest ważny przez 72 godziny.</p>`,
      })
    }
  }
}
