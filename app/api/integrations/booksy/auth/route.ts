import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GmailClient } from '@/lib/booksy/gmail-client'

type BooksyAuthAction = 'connect_new_mailbox' | 'reconnect_mailbox'

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

        const requestedAction = request.nextUrl.searchParams.get('action')
        const requestedAccountId = request.nextUrl.searchParams.get('accountId')
        const action: BooksyAuthAction =
            requestedAction === 'reconnect_mailbox' ? 'reconnect_mailbox' : 'connect_new_mailbox'

        const state = JSON.stringify({
            salonId: profile.salon_id,
            userId: user.id,
            action,
            accountId: action === 'reconnect_mailbox' ? requestedAccountId ?? undefined : undefined,
        })

        const authUrl = GmailClient.getAuthUrl(state)

        console.log('OAuth authUrl:', authUrl)

        return NextResponse.redirect(authUrl)
    } catch (error: any) {
        console.error('Booksy auth error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
