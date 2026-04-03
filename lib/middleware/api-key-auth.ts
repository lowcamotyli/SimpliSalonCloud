import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

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
