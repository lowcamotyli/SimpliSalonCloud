import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { encrypt } from '@/lib/booksy/gmail-auth'

type LegacyOAuthState = {
    salonId?: string
}

function parseState(stateStr: string): LegacyOAuthState | null {
    try {
        return JSON.parse(stateStr) as LegacyOAuthState
    } catch {
        try {
            const normalized = stateStr.replace(/-/g, '+').replace(/_/g, '/')
            const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
            const decoded = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
            return JSON.parse(decoded) as LegacyOAuthState
        } catch {
            return null
        }
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateStr = searchParams.get('state')

    if (!code || !stateStr) {
        return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    try {
        const state = parseState(stateStr)
        if (!state?.salonId) {
            return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
        }

        const { salonId } = state
        const supabase = createAdminClient()

        const { data: existingSettings } = await (supabase
            .from('salon_settings') as any)
            .select('booksy_gmail_tokens')
            .eq('salon_id', salonId)
            .maybeSingle()

        // 1. Exchange code for tokens
        const freshTokens = await GmailClient.getTokens(code) as any
        const tokens = GmailClient.mergeTokens(existingSettings?.booksy_gmail_tokens ?? null, freshTokens)

        // 2. Get Gmail email address
        const client = new GmailClient(tokens)
        const email = await client.getUserEmail()
        if (!email) {
            throw new Error('Unable to resolve Gmail email address')
        }

        const encryptedAccessToken = tokens.access_token ? encrypt(tokens.access_token) : null
        const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null

        if (!encryptedAccessToken || !encryptedRefreshToken) {
            throw new Error('Google OAuth response did not include both access and refresh tokens')
        }

        const now = new Date().toISOString()

        const { data: existingAccount } = await (supabase
            .from('booksy_gmail_accounts') as any)
            .select('id, is_primary')
            .eq('salon_id', salonId)
            .eq('gmail_email', email)
            .maybeSingle()

        const { count } = await (supabase
            .from('booksy_gmail_accounts') as any)
            .select('id', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('is_primary', true)

        const tokenExpiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null

        const { error: mailboxUpsertError } = await (supabase
            .from('booksy_gmail_accounts') as any)
            .upsert({
                salon_id: salonId,
                gmail_email: email,
                encrypted_access_token: encryptedAccessToken,
                encrypted_refresh_token: encryptedRefreshToken,
                token_expires_at: tokenExpiresAt,
                auth_status: 'active',
                is_active: true,
                is_primary: existingAccount?.is_primary ?? !count,
                last_auth_at: now,
                last_error: null,
                updated_at: now,
            }, { onConflict: 'salon_id,gmail_email' })

        if (mailboxUpsertError) throw mailboxUpsertError

        // 3. Save to salon_settings
        // We update salon_settings instead of salons table (to keep it clean)
        const { error: upsertError } = await (supabase
            .from('salon_settings') as any)
            .upsert({
                salon_id: salonId,
                booksy_gmail_email: email,
                booksy_gmail_tokens: tokens, // Store the full tokens object (access + refresh)
                booksy_enabled: true,
                updated_at: now
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
