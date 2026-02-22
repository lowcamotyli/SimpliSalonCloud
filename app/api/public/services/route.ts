import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonId } from '@/lib/utils/salon'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

export async function OPTIONS(request: NextRequest) {
    return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 200 })
}

export async function GET(request: NextRequest) {
    const authError = validateApiKey(request)
    if (authError) {
        return setCorsHeaders(request, authError)
    }

    const supabase = createAdminSupabaseClient()
    const salonId = getSalonId(request)

    const { data, error } = await supabase
        .from('services')
        .select('id, name, category, subcategory, duration, price')
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('category')
        .order('name')

    if (error) {
        const response = NextResponse.json({ error: 'DB error' }, { status: 500 })
        return setCorsHeaders(request, response)
    }

    const response = NextResponse.json({ services: data })
    return setCorsHeaders(request, response)
}
