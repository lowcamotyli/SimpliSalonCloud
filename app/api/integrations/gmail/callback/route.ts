import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GmailClient } from '@/lib/booksy/gmail-client'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateStr = searchParams.get('state')

    if (!code || !stateStr) {
        return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    try {
        const state = JSON.parse(stateStr)
        const { salonId } = state

        // 1. Exchange code for tokens
        const tokens = await GmailClient.getTokens(code) as any

        // 2. Get Gmail email address
        const client = new GmailClient(tokens)
        const email = await client.getUserEmail()

        // 3. Save to salon_settings
        const supabase = await createServerSupabaseClient()

        const { error: upsertError } = await (supabase
            .from('salon_settings') as any)
            .upsert({
                salon_id: salonId,
                booksy_gmail_email: email,
                booksy_gmail_tokens: tokens,
                booksy_enabled: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'salon_id' })

        if (upsertError) throw upsertError

        // 4. Get salon slug for redirect
        const { data: salon } = await (supabase
            .from('salons') as any)
            .select('slug')
            .eq('id', salonId)
            .single()

        const protocol = request.nextUrl.protocol
        const host = request.nextUrl.host
        const redirectUrl = `${protocol}//${host}/${salon?.slug || ''}/settings/integrations/booksy`

        return NextResponse.redirect(redirectUrl)

    } catch (error: any) {
        console.error('Callback error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
