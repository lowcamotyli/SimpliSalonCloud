import { NextRequest } from 'next/server'

export function getSalonId(request: NextRequest): string {
    const headerSalonId = request.headers.get('X-Salon-Id')
    const envSalonId = process.env.PUBLIC_SALON_ID

    console.log('[SALON-ID] Header:', headerSalonId)
    console.log('[SALON-ID] Env:', envSalonId)

    const salonId = headerSalonId || envSalonId

    if (!salonId) {
        throw new Error('Salon ID is not configured (missing X-Salon-Id header or PUBLIC_SALON_ID env)')
    }

    return salonId
}
