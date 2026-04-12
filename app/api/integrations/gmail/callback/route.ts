import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { GmailClient } from '@/lib/booksy/gmail-client'
import { encrypt } from '@/lib/booksy/gmail-auth'

type GmailOAuthState = {
    salonId?: string
    userId?: string
    action?: 'connect_new_mailbox' | 'reconnect_mailbox'
    accountId?: string
}

function mapCallbackError(error: unknown): string {
    const message =
        typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message ?? 'oauth_callback_failed')
            : error instanceof Error
                ? error.message
                : String(error ?? 'oauth_callback_failed')

    if (message.includes('permission denied for table booksy_gmail_accounts')) {
        return 'booksy_mailbox_table_permission_denied'
    }

    if (message.includes('BOOKSY_TOKEN_ENCRYPTION_KEY')) {
        return 'missing_booksy_token_encryption_key'
    }

    if (message.includes('Google OAuth response did not include both access and refresh tokens')) {
        return 'missing_google_refresh_token'
    }

    return message || 'oauth_callback_failed'
}

function parseState(stateStr: string): GmailOAuthState | null {
    try {
        return JSON.parse(stateStr) as GmailOAuthState
    } catch {
        return null
    }
}

async function getRedirectUrl(request: NextRequest, supabase: any, salonId?: string, error?: string) {
    if (!salonId) {
        return null
    }

    const { data: salon } = await (supabase
        .from('salons') as any)
        .select('slug')
        .eq('id', salonId)
        .single()

    const protocol = request.nextUrl.protocol
    const host = request.nextUrl.host
    const redirectUrl = new URL(`${protocol}//${host}/${salon?.slug || ''}/settings/integrations/booksy`)

    if (error) {
        redirectUrl.searchParams.set('error', error)
    }

    return redirectUrl.toString()
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateStr = searchParams.get('state')
    const oauthError = searchParams.get('error')
    const state = stateStr ? parseState(stateStr) : null

    console.log('Booksy Gmail callback env check', {
        hasBooksyTokenKey: Boolean(process.env.BOOKSY_TOKEN_ENCRYPTION_KEY),
        booksyTokenKeyLength: process.env.BOOKSY_TOKEN_ENCRYPTION_KEY?.trim().length ?? 0,
    })

    if (!stateStr) {
        return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
    }

    try {
        if (!state) {
            return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
        }

        const { salonId } = state

        if (!salonId) {
            return NextResponse.json({ error: 'Missing salonId in state' }, { status: 400 })
        }

        const supabase = await createServerSupabaseClient()
        const adminSupabase = createAdminSupabaseClient()

        if (oauthError) {
            const redirectUrl = await getRedirectUrl(request, supabase, salonId, oauthError)
            return redirectUrl
                ? NextResponse.redirect(redirectUrl)
                : NextResponse.json({ error: oauthError }, { status: 400 })
        }

        if (!code) {
            const redirectUrl = await getRedirectUrl(request, supabase, salonId, 'missing_code')
            return redirectUrl
                ? NextResponse.redirect(redirectUrl)
                : NextResponse.json({ error: 'Missing code' }, { status: 400 })
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (state.userId && state.userId !== user.id) {
            return NextResponse.json({ error: 'OAuth state user mismatch' }, { status: 403 })
        }

        const { data: profile, error: profileError } = await (supabase
            .from('profiles') as any)
            .select('salon_id')
            .eq('user_id', user.id)
            .single()

        if (profileError || !profile?.salon_id) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        if (profile.salon_id !== salonId) {
            return NextResponse.json({ error: 'OAuth state salon mismatch' }, { status: 403 })
        }

        const action = state.action ?? 'connect_new_mailbox'

        let existingAccount: any = null

        if (action === 'reconnect_mailbox' && state.accountId) {
            const { data } = await (adminSupabase
                .from('booksy_gmail_accounts') as any)
                .select('id, gmail_email, is_primary')
                .eq('id', state.accountId)
                .eq('salon_id', salonId)
                .maybeSingle()

            existingAccount = data
        }

        const freshTokens = await GmailClient.getTokens(code) as any
        const client = new GmailClient(freshTokens)
        const email = await client.getUserEmail()

        if (!email) {
            throw new Error('Unable to resolve Gmail email address')
        }

        if (!existingAccount) {
            const { data } = await (adminSupabase
                .from('booksy_gmail_accounts') as any)
                .select('id, gmail_email, is_primary')
                .eq('salon_id', salonId)
                .eq('gmail_email', email)
                .maybeSingle()

            existingAccount = data
        }

        const encryptedAccessToken = freshTokens.access_token
            ? encrypt(freshTokens.access_token)
            : null
        const encryptedRefreshToken = freshTokens.refresh_token
            ? encrypt(freshTokens.refresh_token)
            : null

        freshTokens.refresh_token = undefined
        freshTokens.access_token = undefined

        if (!encryptedAccessToken || !encryptedRefreshToken) {
            throw new Error('Google OAuth response did not include both access and refresh tokens')
        }

        const tokenExpiresAt = freshTokens.expiry_date
            ? new Date(freshTokens.expiry_date).toISOString()
            : null
        const now = new Date().toISOString()

        if (action === 'reconnect_mailbox' && existingAccount?.id) {
            const { error: updateError } = await (adminSupabase
                .from('booksy_gmail_accounts') as any)
                .update({
                    gmail_email: email,
                    encrypted_access_token: encryptedAccessToken,
                    encrypted_refresh_token: encryptedRefreshToken,
                    token_expires_at: tokenExpiresAt,
                    auth_status: 'active',
                    is_active: true,
                    last_auth_at: now,
                    last_error: null,
                    updated_at: now,
                })
                .eq('id', existingAccount.id)
                .eq('salon_id', salonId)

            if (updateError) throw updateError
        } else {
            const { count } = await (adminSupabase
                .from('booksy_gmail_accounts') as any)
                .select('id', { count: 'exact', head: true })
                .eq('salon_id', salonId)
                .eq('is_primary', true)

            const { error: upsertError } = await (adminSupabase
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

            if (upsertError) throw upsertError
        }

        const { error: settingsError } = await (adminSupabase
            .from('salon_settings') as any)
            .upsert({
                salon_id: salonId,
                booksy_enabled: true,
                updated_at: now,
            }, { onConflict: 'salon_id' })

        if (settingsError) throw settingsError

        const redirectUrl = await getRedirectUrl(request, supabase, salonId)
        return redirectUrl
            ? NextResponse.redirect(redirectUrl)
            : NextResponse.json({ error: 'Unable to resolve redirect URL' }, { status: 500 })

    } catch (error: any) {
        console.error('Callback error:', error)
        const supabase = await createServerSupabaseClient()
        const redirectUrl = await getRedirectUrl(request, supabase, state?.salonId, mapCallbackError(error))

        return redirectUrl
            ? NextResponse.redirect(redirectUrl)
            : NextResponse.json({ error: error.message }, { status: 500 })
    }
}
