import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { publicBookingSchema } from '@/lib/validators/public-booking.validators'
import { getSalonId } from '@/lib/utils/salon'
import { checkPublicApiRateLimit, getClientIp } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
    try {
        logger.info('[PUBLIC_BOOKINGS] start')

        // Rate limiting check
        const clientIp = getClientIp(request.headers)
        const rateLimitResult = await checkPublicApiRateLimit(clientIp)

        if (!rateLimitResult.success) {
            logger.warn('[PUBLIC_BOOKINGS] rate limit exceeded')
            return NextResponse.json(
                {
                    error: 'Rate limit exceeded. Too many requests.',
                    limit: rateLimitResult.limit,
                    reset: new Date(rateLimitResult.reset).toISOString(),
                },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                        'X-RateLimit-Reset': rateLimitResult.reset.toString(),
                        'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
                    },
                }
            )
        }

        const authError = validateApiKey(request)
        if (authError) {
            logger.warn('[PUBLIC_BOOKINGS] api key invalid')
            return authError
        }

        let body: unknown
        try {
            body = await request.json()
        } catch (error) {
            logger.error('[PUBLIC_BOOKINGS] invalid json body', error as Error)
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = publicBookingSchema.safeParse(body)
        if (!parsed.success) {
            logger.warn('[PUBLIC_BOOKINGS] validation failed')
            return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
        }

        const { name, phone, email, serviceId, employeeId, date, time } = parsed.data
        const supabase = createAdminSupabaseClient()
        const salonId = getSalonId(request)

        if (!salonId) {
            logger.error('[PUBLIC_BOOKINGS] missing PUBLIC_SALON_ID')
            return NextResponse.json({ error: 'PUBLIC_SALON_ID is not configured' }, { status: 500 })
        }

        logger.info('[PUBLIC_BOOKINGS] payload', { serviceId, date, time })

        // pobierz usługę (duration, price)
        logger.info('[PUBLIC_BOOKINGS] fetch service start')
        const { data: service, error: serviceError } = await supabase
            .from('services')
            .select('duration, price')
            .eq('id', serviceId)
            .eq('salon_id', salonId)
            .single()
        logger.info('[PUBLIC_BOOKINGS] fetch service end', { hasService: !!service })

        if (serviceError) {
            logger.error('[PUBLIC_BOOKINGS] service fetch error', serviceError)
            return NextResponse.json({ error: 'Service fetch failed' }, { status: 500 })
        }

        if (!service) {
            logger.warn('[PUBLIC_BOOKINGS] service not found', { serviceId })
            return NextResponse.json({ error: 'Service not found' }, { status: 404 })
        }

        // find or create client po telefonie
        logger.info('[PUBLIC_BOOKINGS] fetch client start')
        let { data: client, error: clientFetchError } = await supabase
            .from('clients')
            .select('id')
            .eq('salon_id', salonId)
            .eq('phone', phone)
            .is('deleted_at', null)
            .single()
        logger.info('[PUBLIC_BOOKINGS] fetch client end', { hasClient: !!client })

        if (clientFetchError && clientFetchError.code !== 'PGRST116') {
            logger.error('[PUBLIC_BOOKINGS] client fetch error', clientFetchError)
            return NextResponse.json({ error: 'Client fetch failed' }, { status: 500 })
        }

        if (!client) {
            logger.info('[PUBLIC_BOOKINGS] generate client code start')
            const { data: codeData, error: codeError } = await supabase
                .rpc('generate_client_code', { salon_uuid: salonId } as never)
            const clientCode = codeData || `C${Date.now().toString().slice(-6)}`
            logger.info('[PUBLIC_BOOKINGS] generate client code end', { hasCode: !!codeData })

            if (codeError) {
                logger.warn('[PUBLIC_BOOKINGS] client code rpc error, using fallback')
            }

            logger.info('[PUBLIC_BOOKINGS] create client start')
            const { data: newClient, error: clientCreateError } = await supabase
                .from('clients')
                .insert({
                    salon_id: salonId,
                    client_code: clientCode,
                    full_name: name,
                    phone,
                    email: email || null,
                    visit_count: 0,
                })
                .select('id')
                .single()
            logger.info('[PUBLIC_BOOKINGS] create client end', { hasClient: !!newClient })

            if (clientCreateError) {
                logger.error('[PUBLIC_BOOKINGS] client create error', clientCreateError)
                return NextResponse.json({ error: 'Client create failed' }, { status: 500 })
            }

            if (!newClient) {
                logger.error('[PUBLIC_BOOKINGS] client create returned null')
                return NextResponse.json({ error: 'Client create failed' }, { status: 500 })
            }

            client = newClient
        }

        if (!client) {
            logger.error('[PUBLIC_BOOKINGS] client missing after create')
            return NextResponse.json({ error: 'Client not resolved' }, { status: 500 })
        }

        // resolve employee
        logger.info('[PUBLIC_BOOKINGS] fetch employee start', { hasEmployeeId: !!employeeId })

        let employee: { id: string } | null = null

        if (employeeId) {
            // Validate provided employee
            const { data: specificEmployee, error: specificEmployeeError } = await supabase
                .from('employees')
                .select('id')
                .eq('id', employeeId)
                .eq('salon_id', salonId)
                .eq('active', true)
                .is('deleted_at', null)
                .single()

            if (specificEmployeeError || !specificEmployee) {
                logger.warn('[PUBLIC_BOOKINGS] provided employee not found or invalid')
                return NextResponse.json({ error: 'Invalid employee specified' }, { status: 400 })
            }
            employee = specificEmployee
        } else {
            // Fallback: any active employee
            const { data: anyEmployee, error: anyEmployeeError } = await supabase
                .from('employees')
                .select('id')
                .eq('salon_id', salonId)
                .eq('active', true)
                .is('deleted_at', null)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle()

            if (anyEmployeeError) {
                logger.error('[PUBLIC_BOOKINGS] employee fetch error', anyEmployeeError)
                return NextResponse.json({ error: 'Employee fetch failed' }, { status: 500 })
            }
            employee = anyEmployee
        }

        logger.info('[PUBLIC_BOOKINGS] fetch employee end', { hasEmployee: !!employee })

        if (!employee) {
            logger.warn('[PUBLIC_BOOKINGS] no active employee found')
            return NextResponse.json({ error: 'No active employee available' }, { status: 404 })
        }

        // overlap check — zajęte sloty tego dnia dla wybranego pracownika
        logger.info('[PUBLIC_BOOKINGS] fetch bookings start')
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('booking_time, duration')
            .eq('salon_id', salonId)
            .eq('employee_id', employee.id)
            .eq('booking_date', date)
            .not('status', 'eq', 'cancelled')
            .is('deleted_at', null)
        logger.info('[PUBLIC_BOOKINGS] fetch bookings end', { count: bookings?.length ?? 0 })

        if (bookingsError) {
            logger.error('[PUBLIC_BOOKINGS] bookings fetch error', bookingsError)
            return NextResponse.json({ error: 'Bookings fetch failed' }, { status: 500 })
        }

        const [h, m] = time.split(':').map(Number)
        const newStart = h * 60 + m
        const newEnd = newStart + service.duration

        const conflict = bookings?.some((b: any) => {
            const [bh, bm] = b.booking_time.split(':').map(Number)
            const bStart = bh * 60 + bm
            const bEnd = bStart + b.duration
            return newStart < bEnd && newEnd > bStart
        })

        if (conflict) {
            logger.warn('[PUBLIC_BOOKINGS] time slot conflict', { date, time })
            return NextResponse.json({ error: 'Time slot not available' }, { status: 409 })
        }

        // create booking
        logger.info('[PUBLIC_BOOKINGS] create booking start')
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .insert({
                salon_id: salonId,
                employee_id: employee.id,
                client_id: client.id,
                service_id: serviceId,
                booking_date: date,
                booking_time: time,
                duration: service.duration,
                base_price: service.price,
                status: 'scheduled',
                source: 'website',
            })
            .select('id, status, booking_date, booking_time')
            .single()
        logger.info('[PUBLIC_BOOKINGS] create booking end', { hasBooking: !!booking })

        if (bookingError) {
            logger.error('[PUBLIC_BOOKINGS] booking create error', bookingError)
            return NextResponse.json({ error: 'Booking failed' }, { status: 500 })
        }

        if (!booking) {
            logger.error('[PUBLIC_BOOKINGS] booking create returned null')
            return NextResponse.json({ error: 'Booking failed' }, { status: 500 })
        }

        logger.info('[PUBLIC_BOOKINGS] success', { bookingId: booking.id })
        return NextResponse.json({ booking }, { status: 201 })
    } catch (error) {
        logger.error('[PUBLIC_BOOKINGS] unhandled error', error as Error)
        return NextResponse.json({ error: 'Unhandled server error' }, { status: 500 })
    }
}
