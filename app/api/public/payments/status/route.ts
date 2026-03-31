import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { getSalonId } from '@/lib/utils/salon'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
    logger.info('[PUBLIC_PAYMENT_STATUS] start', {
        method: request.method,
        pathname: request.nextUrl.pathname,
        hasApiKey: Boolean(request.headers.get('X-API-Key')),
        hasSalonHeader: Boolean(request.headers.get('X-Salon-Id')),
    })

    const authError = validateApiKey(request)
    if (authError) {
        logger.warn('[PUBLIC_PAYMENT_STATUS] api key invalid')
        return authError
    }

    const salonId = getSalonId(request)
    if (!salonId) {
        logger.error('[PUBLIC_PAYMENT_STATUS] missing salon id')
        return NextResponse.json({ error: 'PUBLIC_SALON_ID is not configured' }, { status: 500 })
    }

    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) {
        logger.warn('[PUBLIC_PAYMENT_STATUS] missing sessionId', { salonId })
        return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    logger.info('[PUBLIC_PAYMENT_STATUS] payload parsed', {
        salonId,
        sessionId,
        salonSource: request.headers.get('X-Salon-Id') ? 'header' : 'env',
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

    logger.info('[PUBLIC_PAYMENT_STATUS] success', {
        salonId,
        sessionId,
        bookingId: data.booking_id,
        status: data.status,
    })
    return NextResponse.json({
        status: data.status as 'pending' | 'paid' | 'failed',
        bookingId: data.booking_id,
    })
}
