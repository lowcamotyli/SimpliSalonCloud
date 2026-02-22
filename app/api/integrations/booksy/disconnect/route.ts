import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/integrations/booksy/disconnect
 * Disconnects Booksy Gmail integration for the current user's salon
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('salon_id')
            .eq('user_id', user.id)
            .single()

        if (!profile?.salon_id) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const admin = createAdminClient()

        const { error } = await admin
            .from('salon_settings')
            .update({
                booksy_enabled: false,
                booksy_gmail_email: null,
                booksy_gmail_tokens: null,
                booksy_last_sync_at: null,
            })
            .eq('salon_id', profile.salon_id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Booksy disconnect error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
