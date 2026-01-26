import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GmailClient } from '@/lib/booksy/gmail-client'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Pass salonId or userId in state for the callback
        const { data: profile } = await (supabase
            .from('profiles') as any)
            .select('salon_id')
            .eq('user_id', user.id)
            .single()

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const state = JSON.stringify({
            salonId: profile.salon_id,
            userId: user.id
        })

        const authUrl = GmailClient.getAuthUrl(state)

        return NextResponse.redirect(authUrl)
    } catch (error: any) {
        console.error('Booksy auth error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
