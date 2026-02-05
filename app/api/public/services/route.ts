import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonId } from '@/lib/utils/salon'

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': 'http://localhost:5173',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        },
    })
}

export async function GET(request: NextRequest) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    }

    const authError = validateApiKey(request)
    if (authError) {
        Object.entries(headers).forEach(([key, value]) => authError.headers.set(key, value))
        return authError
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

    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500, headers })

    return NextResponse.json({ services: data }, { headers })
}
