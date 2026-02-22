import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: { slug: string } }
) {
    const supabase = createAdminSupabaseClient()
    const listParams = await params
    const { slug } = listParams

    try {
        // Check if salon exists
        const { data: salon } = await supabase
            .from('salons')
            .select('id')
            .eq('slug', slug)
            .single()

        if (!salon) {
            return NextResponse.json({ error: 'Salon not found' }, { status: 404 })
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
