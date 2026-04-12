import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 200 })
}

export async function GET(request: NextRequest) {
    let salonId: string

    const authResult = await resolveApiKey(request)
    if (authResult instanceof NextResponse) {
        // No API key — allow public access via X-Salon-Id header (salon terms are public data)
        const salonHeader = request.headers.get('X-Salon-Id')?.trim()
        if (!salonHeader) {
            const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            return setCorsHeaders(request, response)
        }
        salonId = salonHeader
    } else {
        salonId = authResult.salonId
        const salonHeader = request.headers.get('X-Salon-Id')?.trim()
        if (salonHeader && salonHeader !== salonId) {
            const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            return setCorsHeaders(request, response)
        }
    }

    const supabase = createAdminSupabaseClient()

    const { data, error } = await supabase
        .from('salon_settings')
        .select('terms_text, terms_url')
        .eq('salon_id', salonId)
        .limit(1)
        .maybeSingle()

    if (error) {
        const response = NextResponse.json({ error: 'DB error' }, { status: 500 })
        return setCorsHeaders(request, response)
    }

    const termsText = data?.terms_text ?? null
    const termsUrl = data?.terms_url ?? null

    const response = NextResponse.json({
        terms_text: termsText,
        terms_url: termsUrl,
        has_terms: Boolean(termsText || termsUrl),
    })

    return setCorsHeaders(request, response)
}
