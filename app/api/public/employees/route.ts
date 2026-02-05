import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/middleware/api-key-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonId } from '@/lib/utils/salon'

export async function GET(request: NextRequest) {
    const authError = validateApiKey(request)
    if (authError) return authError

    const supabase = createAdminSupabaseClient()
    const salonId = getSalonId(request)

    const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('salon_id', salonId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('first_name')

    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

    return NextResponse.json({ employees: data })
}
