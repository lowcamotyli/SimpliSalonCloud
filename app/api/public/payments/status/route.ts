import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'
import { logger } from '@/lib/logger'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { setCorsHeaders } from '@/lib/middleware/cors'

function resolveMaybeEncryptedSecret(value: string | null): string | null {
    if (!value) return null
    return isEncryptedPayload(value) ? decryptSecret(value) : value
}

async function createP24ClientForSalon(supabase: ReturnType<typeof createAdminSupabaseClient>, salonId: string) {
    const { data: settings, error: settingsError } = await supabase
        .from('salon_settings')
        .select('p24_merchant_id, p24_pos_id, p24_crc, p24_api_key, p24_api_url')
        .eq('salon_id', salonId)
        .maybeSingle()

    if (settingsError) {
        throw new Error(`Failed to load salon payment settings: ${settingsError.message}`)
    }

    const merchantId = settings?.p24_merchant_id?.trim()
    const posId = settings?.p24_pos_id?.trim()
    const crc = resolveMaybeEncryptedSecret(settings?.p24_crc ?? null)?.trim()
    const apiKey = resolveMaybeEncryptedSecret(settings?.p24_api_key ?? null)?.trim()
    const apiUrl = settings?.p24_api_url?.trim()

    if (merchantId && posId && crc && apiUrl) {
        return createPrzelewy24Client({
            merchantId,
            posId,
            crc,
            apiKey: apiKey || crc,
            apiUrl,
        })
    }

    return createPrzelewy24Client()
}

function mapP24Status(status: string): 'pending' | 'paid' | 'failed' {
    const normalized = status.trim().toLowerCase()

    if (['success', 'paid', 'confirmed', 'completed'].includes(normalized)) {
        return 'paid'
    }

    if (['failed', 'error', 'canceled', 'cancelled', 'rejected'].includes(normalized)) {
        return 'failed'
    }

    return 'pending'
}

export async function GET(request: NextRequest) {
    logger.info('[PUBLIC_PAYMENT_STATUS] start', {
        method: request.method,
        pathname: request.nextUrl.pathname,
        hasApiKey: Boolean(request.headers.get('X-API-Key')),
        hasSalonHeader: Boolean(request.headers.get('X-Salon-Id')),
    })

    const authResult = await resolveApiKey(request)
    if (authResult instanceof NextResponse) return setCorsHeaders(request, authResult)
    const { salonId } = authResult

    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) {
        logger.warn('[PUBLIC_PAYMENT_STATUS] missing sessionId', { salonId })
        return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    logger.info('[PUBLIC_PAYMENT_STATUS] payload parsed', {
        salonId,
        sessionId,
        salonSource: 'api-key',
    })

    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
        .from('booking_payments')
        .select('status, booking_id')
        .eq('p24_session_id', sessionId)
        .eq('salon_id', salonId)
        .limit(1)
        .maybeSingle()

    if (error) {
        logger.error('[PUBLIC_PAYMENT_STATUS] failed to fetch payment session', error, {
            salonId,
            sessionId,
        })
        return NextResponse.json({ error: 'Failed to fetch payment session' }, { status: 500 })
    }

    if (!data) {
        logger.warn('[PUBLIC_PAYMENT_STATUS] payment session not found', {
            salonId,
            sessionId,
        })
        return NextResponse.json({ error: 'Payment session not found' }, { status: 404 })
    }

    let resolvedStatus = data.status as 'pending' | 'paid' | 'failed'

    if (resolvedStatus === 'pending') {
        try {
            const p24 = await createP24ClientForSalon(supabase, salonId)
            const remoteStatus = await p24.getTransactionStatus(sessionId)
            const mappedStatus = mapP24Status(remoteStatus.status)

            logger.info('[PUBLIC_PAYMENT_STATUS] p24 fallback checked', {
                salonId,
                sessionId,
                bookingId: data.booking_id,
                localStatus: resolvedStatus,
                remoteStatus: remoteStatus.status,
                mappedStatus,
            })

            if (mappedStatus !== resolvedStatus) {
                resolvedStatus = mappedStatus

                const updatePayload: {
                    status: 'pending' | 'paid' | 'failed'
                    paid_at?: string
                } = {
                    status: mappedStatus,
                }

                if (mappedStatus === 'paid') {
                    updatePayload.paid_at = new Date().toISOString()
                }

                const { error: updateError } = await supabase
                    .from('booking_payments')
                    .update(updatePayload)
                    .eq('p24_session_id', sessionId)
                    .eq('salon_id', salonId)

                if (updateError) {
                    logger.warn('[PUBLIC_PAYMENT_STATUS] failed to persist fallback status', {
                        salonId,
                        sessionId,
                        bookingId: data.booking_id,
                        mappedStatus,
                        updateErrorMessage: updateError.message,
                    })
                }
            }
        } catch (error) {
            logger.warn('[PUBLIC_PAYMENT_STATUS] p24 fallback failed', {
                salonId,
                sessionId,
                bookingId: data.booking_id,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            })
        }
    }

    logger.info('[PUBLIC_PAYMENT_STATUS] success', {
        salonId,
        sessionId,
        bookingId: data.booking_id,
        status: resolvedStatus,
    })
    return NextResponse.json({
        status: resolvedStatus,
        bookingId: data.booking_id,
    })
}
