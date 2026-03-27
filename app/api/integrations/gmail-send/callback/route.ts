import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { encryptSecret } from '@/lib/messaging/crypto'

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type GoogleUserInfoResponse = {
  email?: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings/integrations?gmail_send=error', request.nextUrl.origin))
  }

  try {
    const { salonId } = JSON.parse(state) as { salonId: string }

    if (!salonId) {
      throw new Error('Missing salonId in state')
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = `${request.nextUrl.origin}/api/integrations/gmail-send/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Missing Gmail Send OAuth environment variables')
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse

    if (!tokenResponse.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code for tokens')
    }

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    if (!accessToken || !refreshToken) {
      throw new Error('Missing access_token or refresh_token from Google token response')
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfoResponse

    if (!userInfoResponse.ok || !userInfo.email) {
      throw new Error('Failed to fetch Gmail user profile')
    }

    const accessTokenEnc = encryptSecret(accessToken)
    const refreshTokenEnc = encryptSecret(refreshToken)
    const tokenExpiry = typeof tokenData.expires_in === 'number'
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null

    const supabase = createAdminSupabaseClient()

    const { error: upsertError } = await supabase
      .from('gmail_send_credentials')
      .upsert(
        {
          salon_id: salonId,
          email: userInfo.email,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          token_expiry: tokenExpiry
        },
        { onConflict: 'salon_id' }
      )

    if (upsertError) {
      throw upsertError
    }

    const { error: updateSalonError } = await supabase
      .from('salons')
      .update({ email_provider: 'gmail' })
      .eq('id', salonId)

    if (updateSalonError) {
      throw updateSalonError
    }

    return NextResponse.redirect(new URL('/settings/integrations?gmail_send=connected', request.nextUrl.origin))
  } catch {
    return NextResponse.redirect(new URL('/settings/integrations?gmail_send=error', request.nextUrl.origin))
  }
}
