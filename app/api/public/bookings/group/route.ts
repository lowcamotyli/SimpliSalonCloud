import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonId } from '@/lib/utils/salon'
import { checkPublicApiRateLimit, getClientIp } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'
import { validateClientCanBook } from '@/lib/booking/validation'

interface PublicGroupBookingRequest {
    name: string
    phone: string
    email?: string
    items: Array<{ serviceId: string; employeeId: string; date: string; time: string }>
}

interface ResolvedGroupBookingItem {
    service: {
        duration: number
        price: number
    }
    employee: {
        id: string
    }
    requiredEquipmentIds: string[]
}

export async function POST(request: NextRequest) {
    try {
        logger.info('[PUBLIC_GROUP_BOOKINGS] start')

        // Rate limiting check
        const clientIp = getClientIp(request.headers)
        const rateLimitResult = await checkPublicApiRateLimit(clientIp)

        if (!rateLimitResult.success) {
            logger.warn('[PUBLIC_GROUP_BOOKINGS] rate limit exceeded')
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
            logger.warn('[PUBLIC_GROUP_BOOKINGS] api key invalid')
            return authError
        }

        let body: PublicGroupBookingRequest
        try {
            body = (await request.json()) as PublicGroupBookingRequest
        } catch (error) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] invalid json body', error as Error)
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { name, phone, email, items } = body

        if (
            !name ||
            !phone ||
            !Array.isArray(items) ||
            items.length < 1 ||
            items.some(
                item =>
                    !item ||
                    !item.serviceId ||
                    !item.employeeId ||
                    !item.date ||
                    !item.time
            )
        ) {
            logger.warn('[PUBLIC_GROUP_BOOKINGS] validation failed')
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const supabase = createAdminSupabaseClient()
        const salonId = getSalonId(request)

        if (!salonId) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] missing PUBLIC_SALON_ID')
            return NextResponse.json({ error: 'PUBLIC_SALON_ID is not configured' }, { status: 500 })
        }

        logger.info('[PUBLIC_GROUP_BOOKINGS] payload', { itemsCount: items.length })

        // find or create client po telefonie
        logger.info('[PUBLIC_GROUP_BOOKINGS] fetch client start')
        let { data: client, error: clientFetchError } = await supabase
            .from('clients')
            .select('id')
            .eq('salon_id', salonId)
            .eq('phone', phone)
            .is('deleted_at', null)
            .single()
        logger.info('[PUBLIC_GROUP_BOOKINGS] fetch client end', { hasClient: !!client })

        if (clientFetchError && clientFetchError.code !== 'PGRST116') {
            logger.error('[PUBLIC_GROUP_BOOKINGS] client fetch error', clientFetchError)
            return NextResponse.json({ error: 'Client fetch failed' }, { status: 500 })
        }

        if (!client) {
            logger.info('[PUBLIC_GROUP_BOOKINGS] generate client code start')
            const { data: codeData, error: codeError } = await supabase
                .rpc('generate_client_code', { salon_uuid: salonId } as never)
            const clientCode = codeData || `C${Date.now().toString().slice(-6)}`
            logger.info('[PUBLIC_GROUP_BOOKINGS] generate client code end', { hasCode: !!codeData })

            if (codeError) {
                logger.warn('[PUBLIC_GROUP_BOOKINGS] client code rpc error, using fallback')
            }

            logger.info('[PUBLIC_GROUP_BOOKINGS] create client start')
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
            logger.info('[PUBLIC_GROUP_BOOKINGS] create client end', { hasClient: !!newClient })

            if (clientCreateError) {
                logger.error('[PUBLIC_GROUP_BOOKINGS] client create error', clientCreateError)
                return NextResponse.json({ error: 'Client create failed' }, { status: 500 })
            }

            if (!newClient) {
                logger.error('[PUBLIC_GROUP_BOOKINGS] client create returned null')
                return NextResponse.json({ error: 'Client create failed' }, { status: 500 })
            }

            client = newClient
        }

        if (!client) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] client missing after create')
            return NextResponse.json({ error: 'Client not resolved' }, { status: 500 })
        }

        const bookingEligibility = await validateClientCanBook(phone, salonId)
        if (!bookingEligibility.allowed) {
            logger.warn('[PUBLIC_GROUP_BOOKINGS] blocked blacklisted client', { phone, salonId })
            return NextResponse.json(
                { error: bookingEligibility.message || 'Booking unavailable for this client' },
                { status: 403 }
            )
        }

        const resolvedItems: ResolvedGroupBookingItem[] = []

        for (const [i, item] of items.entries()) {
            const { data: service } = await supabase
                .from('services')
                .select('duration, price')
                .eq('id', item.serviceId)
                .eq('salon_id', salonId)
                .single()

            if (!service) {
                logger.warn('[PUBLIC_GROUP_BOOKINGS] service not found', { serviceId: item.serviceId, index: i })
                return NextResponse.json(
                    { error: 'Service not found', conflictingItemIndex: i },
                    { status: 404 }
                )
            }

            const { data: employee } = await supabase
                .from('employees')
                .select('id')
                .eq('id', item.employeeId)
                .eq('salon_id', salonId)
                .eq('active', true)
                .is('deleted_at', null)
                .single()

            if (!employee) {
                logger.warn('[PUBLIC_GROUP_BOOKINGS] invalid employee specified', {
                    employeeId: item.employeeId,
                    index: i,
                })
                return NextResponse.json(
                    { error: 'Invalid employee specified', conflictingItemIndex: i },
                    { status: 400 }
                )
            }

            const { data: bookings, error: bookingsError } = await supabase
                .from('bookings')
                .select('booking_time, duration')
                .eq('salon_id', salonId)
                .eq('employee_id', item.employeeId)
                .eq('booking_date', item.date)
                .not('status', 'eq', 'cancelled')
                .is('deleted_at', null)

            if (bookingsError) {
                logger.error('[PUBLIC_GROUP_BOOKINGS] bookings fetch error', bookingsError)
                return NextResponse.json({ error: 'Bookings fetch failed' }, { status: 500 })
            }

            const [h, m] = item.time.split(':').map(Number)
            const newStart = h * 60 + m
            const newEnd = newStart + service.duration

            const conflict = bookings?.some((booking: any) => {
                const [bh, bm] = booking.booking_time.split(':').map(Number)
                const bStart = bh * 60 + bm
                const bEnd = bStart + booking.duration
                return newStart < bEnd && newEnd > bStart
            })

            if (conflict) {
                logger.warn('[PUBLIC_GROUP_BOOKINGS] time slot conflict', {
                    date: item.date,
                    time: item.time,
                    index: i,
                })
                return NextResponse.json(
                    { error: 'Time slot not available', conflictingItemIndex: i },
                    { status: 409 }
                )
            }

            const { data: serviceEquipmentRows } = await supabase
                .from('service_equipment')
                .select('equipment_id')
                .eq('service_id', item.serviceId)
            const requiredEquipmentIds = (serviceEquipmentRows ?? []).map((row: any) => row.equipment_id)

            if (requiredEquipmentIds.length > 0) {
                const startsAt = new Date(`${item.date}T${item.time}:00Z`)
                const endsAt = new Date(startsAt.getTime() + service.duration * 60_000)
                const { data: equipmentAvailability } = await supabase.rpc('check_equipment_availability', {
                    p_equipment_ids: requiredEquipmentIds,
                    p_starts_at: startsAt.toISOString(),
                    p_ends_at: endsAt.toISOString(),
                    p_exclude_booking_id: null,
                } as any)
                const equipmentConflicts = (equipmentAvailability ?? []).filter((a: any) => !a.is_available)

                if (equipmentConflicts.length > 0) {
                    logger.warn('[PUBLIC_GROUP_BOOKINGS] equipment conflict', {
                        date: item.date,
                        time: item.time,
                        conflicts: equipmentConflicts.length,
                        index: i,
                    })
                    return NextResponse.json(
                        { error: 'Time slot not available', conflictingItemIndex: i },
                        { status: 409 }
                    )
                }
            }

            resolvedItems.push({ service, employee, requiredEquipmentIds })
        }

        const { data: visitGroup, error: visitGroupError } = await supabase
            .from('visit_groups')
            .insert({
                salon_id: salonId,
                client_id: client.id,
                status: 'confirmed',
                total_price: 0,
                total_duration: 0,
            })
            .select('id')
            .single()

        if (visitGroupError || !visitGroup) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] visit group create error', visitGroupError)
            return NextResponse.json({ error: 'Visit group create failed' }, { status: 500 })
        }

        const createdBookings: Array<{ id: string; status: string; booking_date: string; booking_time: string }> = []
        let totalPrice = 0
        let totalDuration = 0

        for (const [i, item] of items.entries()) {
            const resolved = resolvedItems[i]
            const { data: booking, error: bookingError } = await supabase
                .from('bookings')
                .insert({
                    salon_id: salonId,
                    employee_id: resolved.employee.id,
                    client_id: client.id,
                    service_id: item.serviceId,
                    booking_date: item.date,
                    booking_time: item.time,
                    duration: resolved.service.duration,
                    base_price: resolved.service.price,
                    status: 'scheduled',
                    source: 'website',
                    visit_group_id: visitGroup.id,
                } as any)
                .select('id, status, booking_date, booking_time')
                .single()

            if (bookingError || !booking) {
                logger.error('[PUBLIC_GROUP_BOOKINGS] booking create error', bookingError)
                await supabase.from('visit_groups').delete().eq('id', visitGroup.id)
                return NextResponse.json({ error: 'Booking failed' }, { status: 500 })
            }

            if (resolved.requiredEquipmentIds.length > 0) {
                const startsAt = new Date(`${item.date}T${item.time}:00Z`)
                const endsAt = new Date(startsAt.getTime() + resolved.service.duration * 60_000)
                await supabase.from('equipment_bookings').insert(
                    resolved.requiredEquipmentIds.map(eqId => ({
                        booking_id: booking.id,
                        equipment_id: eqId,
                        starts_at: startsAt.toISOString(),
                        ends_at: endsAt.toISOString(),
                    }))
                )
            }

            createdBookings.push(booking)
            totalPrice += resolved.service.price
            totalDuration += resolved.service.duration
        }

        const { data: updatedGroup } = await supabase
            .from('visit_groups')
            .update({
                total_price: totalPrice,
                total_duration: totalDuration,
            })
            .eq('id', visitGroup.id)
            .select('id, status, total_price, total_duration')
            .single()

        logger.info('[PUBLIC_GROUP_BOOKINGS] success', { visitGroupId: visitGroup.id, bookingsCount: createdBookings.length })
        return NextResponse.json(
            {
                visitGroup: updatedGroup ?? {
                    id: visitGroup.id,
                    status: 'confirmed',
                    total_price: totalPrice,
                    total_duration: totalDuration,
                },
                bookings: createdBookings,
            },
            { status: 201 }
        )
    } catch (error) {
        logger.error('[PUBLIC_GROUP_BOOKINGS] unhandled error', error as Error)
        return NextResponse.json({ error: 'Unhandled server error' }, { status: 500 })
    }
}
