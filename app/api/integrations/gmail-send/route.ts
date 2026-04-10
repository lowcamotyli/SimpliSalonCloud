import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { getGmailSendRedirectUri } from '@/lib/google/get-google-redirect-uri'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface GmailSendStatusResponse {
  connected: boolean
  email: string | null
  email_provider: string | null
}

interface GmailSendAuthResponse {
  authUrl: string
}

interface SuccessResponse {
  success: true
}

function handleRouteError(error: unknown): NextResponse<{ error: string }> {
  if (error instanceof AppError) {
    return NextResponse.json<{ error: string }>({ error: error.message }, { status: error.statusCode })
  }

  const message = error instanceof Error ? error.message : 'Internal server error'
  return NextResponse.json<{ error: string }>({ error: message }, { status: 500 })
}

function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET')
  }

  return { clientId, clientSecret }
}

async function getConnectionStatus(): Promise<NextResponse<GmailSendStatusResponse | { error: string }>> {
  const { salonId } = await getAuthContext()
  const adminSupabase = createAdminSupabaseClient()

  const [credResult, salonResult] = await Promise.all([
    adminSupabase
      .from('gmail_send_credentials')
      .select('email')
      .eq('salon_id', salonId)
      .maybeSingle(),
    adminSupabase
      .from('salons')
      .select('email_provider')
      .eq('id', salonId)
      .maybeSingle(),
  ])

  if (credResult.error) {
    return NextResponse.json({ error: credResult.error.message }, { status: 500 })
  }

  const data = credResult.data
  return NextResponse.json({
    connected: Boolean(data?.email),
    email: data?.email ?? null,
    email_provider: salonResult.data?.email_provider ?? 'resend',
  })
}

async function initiateOAuth(): Promise<NextResponse<GmailSendAuthResponse>> {
  const { salonId } = await getAuthContext()
  const { clientId } = getGoogleCredentials()
  const redirectUri = getGmailSendRedirectUri()

  const state = JSON.stringify({ salonId })
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()}`

  return NextResponse.json({ authUrl })
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<GmailSendStatusResponse | GmailSendAuthResponse | { error: string }>> {
  try {
    const isStatusCheck = request.nextUrl.searchParams.get('status') === 'true'

    if (isStatusCheck) {
      return await getConnectionStatus()
    }

    return await initiateOAuth()
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function DELETE(): Promise<NextResponse<SuccessResponse | { error: string }>> {
  try {
    const { salonId } = await getAuthContext()
    const adminSupabase = createAdminSupabaseClient()

    const { error: deleteError } = await adminSupabase
      .from('gmail_send_credentials')
      .delete()
      .eq('salon_id', salonId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    const { error: updateError } = await adminSupabase
      .from('salons')
      .update({ email_provider: 'resend' })
      .eq('id', salonId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error)
  }
}
