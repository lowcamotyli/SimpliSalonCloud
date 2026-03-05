import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const ALLOWED_VIOLATION_TYPES = ['no_show', 'late_cancel', 'late_arrival', 'misconduct'] as const
type ViolationType = typeof ALLOWED_VIOLATION_TYPES[number]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (profileError) throw profileError
    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const salonId = (profile as any).salon_id

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, salon_id, blacklist_status, no_show_count, blacklisted_at, blacklist_reason')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (clientError) throw clientError
    if (!client || (client as any).salon_id !== salonId) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const limitRaw = Number(new URL(request.url).searchParams.get('limit') || 20)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

    const { data: violations, error: violationsError } = await supabase
      .from('client_violations')
      .select(`
        id,
        booking_id,
        violation_type,
        occurred_at,
        booking:bookings(id, booking_date, booking_time, status)
      `)
      .eq('client_id', id)
      .order('occurred_at', { ascending: false })
      .limit(limit)

    if (violationsError) throw violationsError

    return NextResponse.json({
      client,
      violations: violations || [],
    })
  } catch (error) {
    console.error('[CLIENT_VIOLATIONS][GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const role = user.app_metadata?.role
    if (role !== 'owner' && role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const salonId = user.app_metadata?.salon_id
    if (!salonId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .eq('salon_id', salonId)
      .is('deleted_at', null)
      .maybeSingle()

    if (clientError) throw clientError
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const body = await request.json()
    const violationType = body?.violation_type as string
    const note = typeof body?.note === 'string' ? body.note : undefined

    if (!ALLOWED_VIOLATION_TYPES.includes(violationType as ViolationType)) {
      return NextResponse.json(
        {
          error: `Invalid violation_type. Allowed values: ${ALLOWED_VIOLATION_TYPES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const { data: violation, error: insertError } = await supabase
      .from('client_violations')
      .insert({
        client_id: id,
        violation_type: violationType,
        occurred_at: new Date().toISOString(),
        ...(note ? { note } : {}),
      })
      .select('id, violation_type, occurred_at')
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ violation }, { status: 201 })
  } catch (error) {
    console.error('[CLIENT_VIOLATIONS][POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
