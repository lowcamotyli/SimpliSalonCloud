import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 200 })
}

export async function GET(request: NextRequest) {
    const authResult = await resolveApiKey(request)
    if (authResult instanceof NextResponse) {
        return setCorsHeaders(request, authResult)
    }
    const { salonId } = authResult

    const supabase = createAdminSupabaseClient()

    const { data, error } = await supabase
        .from('services')
        .select(
            'id, name, category, subcategory, duration, price, description, service_media(id, public_url, alt_text, sort_order)',
        )
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort_order', { foreignTable: 'service_media', ascending: true })
        .order('category')
        .order('name')

    if (error) {
        const response = NextResponse.json({ error: 'DB error' }, { status: 500 })
        return setCorsHeaders(request, response)
    }

    const services = (data ?? []).map(({ service_media, ...service }) => ({
        ...service,
        images: service_media ?? [],
    }))

    const response = NextResponse.json({ services })
    return setCorsHeaders(request, response)
}
