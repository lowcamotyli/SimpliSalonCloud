import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const salonId = profile?.salon_id
    if (!salonId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: client, error: clientError } = await (supabase as any)
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const { data, error } = await (supabase as any)
      .from('sms_messages')
      .select('id, direction, body, status, provider_message_id, sent_at, delivered_at, created_at')
      .eq('salon_id', salonId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(300)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch SMS history' },
      { status: 500 }
    )
  }
}
