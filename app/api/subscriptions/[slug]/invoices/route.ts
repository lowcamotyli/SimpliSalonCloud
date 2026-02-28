import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const supabase = createAdminSupabaseClient()
    const supabaseUser = await createServerSupabaseClient()
    const listParams = await params
    const { slug } = listParams

    try {
        // Verify caller is authenticated
        const { data: { user } } = await supabaseUser.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if salon exists
        const { data: salon } = await supabase
            .from('salons')
            .select('id')
            .eq('slug', slug)
            .single()

        if (!salon) {
            return NextResponse.json({ error: 'Salon not found' }, { status: 404 })
        }

        // Verify caller belongs to this salon
        const { data: profile } = await supabase
            .from('profiles')
            .select('salon_id')
            .eq('user_id', user.id)
            .eq('salon_id', salon.id)
            .maybeSingle()

        if (!profile) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Fetch invoices with sorting by date DESC
        const { data: invoices, error } = await supabase
            .from('invoices')
            .select('*')
            .eq('salon_id', salon.id)
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json(invoices || [])
    } catch (error) {
        console.error('Error fetching invoices:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
