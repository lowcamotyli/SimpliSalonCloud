import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const DEFAULT_DEV_KEY = 'dev-test-key-change-in-production'

export function validateApiKey(request: NextRequest): NextResponse | null {
    const apiKey = request.headers.get('X-API-Key')
    const expectedKey = process.env.PUBLIC_API_KEY

    if (!expectedKey) {
        console.error('[API-KEY] PUBLIC_API_KEY not set')
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    if (expectedKey === DEFAULT_DEV_KEY) {
        console.warn('[API-KEY] SECURITY: PUBLIC_API_KEY is set to the default development value')
    }

    if (!apiKey || apiKey.length !== expectedKey.length ||
        !timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
        console.error('[API-KEY] MISMATCH')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return null
}

export async function resolveApiKey(request: NextRequest): Promise<{ salonId: string; keyId: string } | NextResponse> {
    const rawKey = request.headers.get('X-API-Key')

    if (!rawKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const supabase = createAdminSupabaseClient()
    const { data } = await (supabase as any)
        .from('salon_api_keys')
        .select('id, salon_id')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .maybeSingle()
    const apiKeyRow = data as { id: string; salon_id: string } | null

    if (apiKeyRow) {
        void (supabase as any)
            .from('salon_api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', apiKeyRow.id)

        return { salonId: apiKeyRow.salon_id, keyId: apiKeyRow.id }
    }

    const envKey = process.env.PUBLIC_API_KEY
    const envSalon = process.env.PUBLIC_SALON_ID

    if (envKey && envSalon && rawKey === envKey) {
        return { salonId: envSalon, keyId: 'env-fallback' }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
