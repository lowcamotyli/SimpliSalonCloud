import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { checkPublicApiRateLimit, getClientIp } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/logger'
import { validateClientCanBook } from '@/lib/booking/validation'
import { setCorsHeaders } from '@/lib/middleware/cors'
import { resolveBookingBasePrice } from '@/lib/services/price-types'
import { publicGroupBookingSchema } from '@/lib/validators/public-booking.validators'
import { resolveSalonTimeZone } from '@/lib/utils/timezone'
import { buildSalonSlotUtcRange } from '@/lib/utils/equipment-timezone'

interface ResolvedGroupBookingItem {
    service: {
        duration: number
        price: number
        price_type?: string
    }
    employee: {
        id: string
    }
    requiredEquipmentIds: string[]
}

function getSlotRange(
    date: string,
    time: string,
    durationMinutes: number,
    timeZone: string
): { startsAtIso: string; endsAtIso: string } {
    return buildSalonSlotUtcRange(date, time, durationMinutes, timeZone)
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

        const authResult = await resolveApiKey(request)
        if (authResult instanceof NextResponse) return setCorsHeaders(request, authResult)
        const { salonId } = authResult

        const supabase = createAdminSupabaseClient()

        const { data: salonSettings, error: salonSettingsError } = await supabase
            .from('salon_settings')
            .select('terms_text, terms_url, timezone')
            .eq('salon_id', salonId)
            .maybeSingle()

        if (salonSettingsError) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] salon settings fetch error', salonSettingsError)
            return NextResponse.json({ error: 'Salon settings fetch failed' }, { status: 500 })
        }

        let body: unknown
        try {
            body = await request.json()
        } catch (error) {
            logger.error('[PUBLIC_GROUP_BOOKINGS] invalid json body', error as Error)
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = publicGroupBookingSchema.safeParse(body)
        if (!parsed.success) {
            logger.warn('[PUBLIC_GROUP_BOOKINGS] validation failed')
            return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
        }

        const { name, phone, email, items, terms_accepted } = parsed.data
        const termsAcceptedAt = terms_accepted ? new Date().toISOString() : null

        if ((salonSettings?.terms_text || salonSettings?.terms_url) && !terms_accepted) {
            return NextResponse.json({ error: 'terms_not_accepted' }, { status: 422 })
        }
        const salonTimeZone = resolveSalonTimeZone(salonSettings?.timezone ?? null)

        logger.info('[PUBLIC_GROUP_BOOKINGS] payload', { itemsCount: items.length })

        // find or create client po telefonie
        logger.info('[PUBLIC_GROUP_BOOKINGS] fetch client start')
        let { data: client, error: clientFetchError } = await supabase
            .from('clients')
            .select('id, email')
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
                .select('id, email')
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

        if (email && !client.email) {
            logger.info('[PUBLIC_GROUP_BOOKINGS] patch client email start', { clientId: client.id })
            const { data: updatedClient, error: clientUpdateError } = await supabase
                .from('clients')
                .update({ email })
                .eq('id', client.id)
                .eq('salon_id', salonId)
                .select('id, email')
                .single()

            if (clientUpdateError) {
                logger.error('[PUBLIC_GROUP_BOOKINGS] client email update error', clientUpdateError, {
                    clientId: client.id,
                })
                return NextResponse.json({ error: 'Client update failed' }, { status: 500 })
            }

            if (updatedClient) {
                client = updatedClient
            }

            logger.info('[PUBLIC_GROUP_BOOKINGS] patch client email end', {
                clientId: client.id,
                hasEmail: Boolean(client.email),
            })
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
                .select('duration, price, price_type')
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

            const { data: serviceEquipmentRows } = await supabase
                .from('service_equipment')
                .select('equipment_id')
                .eq('service_id', item.serviceId)
            const requiredEquipmentIds = (serviceEquipmentRows ?? []).map((row: any) => row.equipment_id)

            if (requiredEquipmentIds.length > 0) {
                const { startsAtIso, endsAtIso } = getSlotRange(item.date, item.time, service.duration, salonTimeZone)
                const { data: equipmentAvailability } = await supabase.rpc('check_equipment_availability', {
                    p_equipment_ids: requiredEquipmentIds,
                    p_starts_at: startsAtIso,
                    p_ends_at: endsAtIso,
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

        const rpcItems = items.map((item, i) => ({
            service_id: item.serviceId,
            employee_id: item.employeeId,
            booking_date: item.date,
            booking_time: item.time,
            duration: resolvedItems[i].service.duration,
            base_price: resolveBookingBasePrice(
                resolvedItems[i].service.price,
                resolvedItems[i].service.price_type
            ),
        }))

        const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
            'create_group_booking_atomic',
            {
                p_salon_id: salonId,
                p_client_id: client.id,
                p_payment_method: null,
                p_notes: null,
                p_items: rpcItems,
                p_terms_accepted_at: termsAcceptedAt,
            }
        )

        if (rpcError) {
            if (rpcError.code === '23P01') {
                const detail: string = rpcError.details ?? rpcError.detail ?? ''
                const itemMatch = detail.match(/item[s]?\s+(\d+)/)
                const conflictingItemIndex = itemMatch ? parseInt(itemMatch[1], 10) : 0
                return NextResponse.json({ error: 'Time slot not available', conflictingItemIndex }, { status: 409 })
            }
            logger.error('[PUBLIC_GROUP_BOOKINGS] rpc error', rpcError)
            return NextResponse.json({ error: 'Booking failed' }, { status: 500 })
        }

        // Create equipment bookings using booking IDs returned from RPC (rpcResult.bookings[i].id matches items[i])
        for (const [i, item] of items.entries()) {
            const resolved = resolvedItems[i]
            if (resolved.requiredEquipmentIds.length > 0) {
                const bookingId = rpcResult.bookings[i]?.id
                if (bookingId) {
                    const { startsAtIso, endsAtIso } = getSlotRange(
                        item.date,
                        item.time,
                        resolved.service.duration,
                        salonTimeZone
                    )
                    await supabase.from('equipment_bookings').insert(
                        resolved.requiredEquipmentIds.map((eqId: string) => ({
                            booking_id: bookingId,
                            equipment_id: eqId,
                            starts_at: startsAtIso,
                            ends_at: endsAtIso,
                        }))
                    )
                }
            }
        }

        logger.info('[PUBLIC_GROUP_BOOKINGS] success', { visitGroupId: rpcResult.visit_group_id, bookingsCount: rpcResult.bookings.length })
        return NextResponse.json(
            {
                visitGroup: { id: rpcResult.visit_group_id, status: 'confirmed' },
                bookings: rpcResult.bookings,
            },
            { status: 201 }
        )
    } catch (error) {
        logger.error('[PUBLIC_GROUP_BOOKINGS] unhandled error', error as Error)
        return NextResponse.json({ error: 'Unhandled server error' }, { status: 500 })
    }
}
