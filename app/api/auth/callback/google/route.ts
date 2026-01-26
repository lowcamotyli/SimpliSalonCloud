import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
        const supabase = createAdminClient()

        // We update salon_settings instead of salons table (to keep it clean)
        const { error: upsertError } = await (supabase
            .from('salon_settings') as any)
            .upsert({
                salon_id: salonId,
                booksy_gmail_email: email,
                booksy_gmail_tokens: tokens, // Store the full tokens object (access + refresh)
                booksy_enabled: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'salon_id' })

        if (upsertError) throw upsertError

        // Redirect back to integrations page
        const protocol = request.nextUrl.protocol
        const host = request.nextUrl.host

        // Get slug of the salon to redirect back correctly
        const { data: salon } = await (supabase
            .from('salons') as any)
            .select('slug')
            .eq('id', salonId)
            .single()

        const redirectUrl = `${protocol}//${host}/${salon?.slug || ''}/settings/integrations/booksy`
        return NextResponse.redirect(redirectUrl)

    } catch (error: any) {
        console.error('Callback error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
