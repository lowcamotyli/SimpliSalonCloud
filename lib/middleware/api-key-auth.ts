import { NextRequest, NextResponse } from 'next/server'

export function validateApiKey(request: NextRequest): NextResponse | null {
    const apiKey = request.headers.get('X-API-Key')
    const expectedKey = process.env.PUBLIC_API_KEY

    console.log('[API-KEY] Received:', apiKey)
    console.log('[API-KEY] Expected:', expectedKey)

    if (!expectedKey) {
        console.error('[API-KEY] PUBLIC_API_KEY not set')
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    if (!apiKey || apiKey !== expectedKey) {
        console.error('[API-KEY] INVALID')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[API-KEY] OK')
    return null
}
