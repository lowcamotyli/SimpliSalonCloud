import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

async function getMembership(supabase: any, userId: string, salonId?: string) {
  let query = supabase
    .from('profiles')
    .select('salon_id, role')
    .eq('user_id', userId)

  if (salonId) {
    query = query.eq('salon_id', salonId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as { salon_id: string; role: string } | null
}

async function getClient(supabase: any, clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, salon_id, blacklist_status')
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data as { id: string; salon_id: string; blacklist_status: string } | null
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

    const client = await getClient(supabase, id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const membership = await getMembership(supabase, user.id, client.salon_id)
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { reason?: string }
    const reason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'Manualna blokada przez pracownika salonu.'

    const { data: updatedClient, error: updateError } = await supabase
      .from('clients')
      .update({
        blacklist_status: 'blacklisted',
        blacklisted_at: new Date().toISOString(),
        blacklist_reason: reason,
      })
      .eq('id', id)
      .eq('salon_id', client.salon_id)
      .select('id, blacklist_status, no_show_count, blacklisted_at, blacklist_reason')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ client: updatedClient })
  } catch (error) {
    console.error('[CLIENT_BLACKLIST][POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    const client = await getClient(supabase, id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const membership = await getMembership(supabase, user.id, client.salon_id)
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { reason?: string }
    const unlockReason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : null

    const { data: updatedClient, error: updateError } = await supabase
      .from('clients')
      .update({
        blacklist_status: 'clean',
        blacklisted_at: null,
        blacklist_reason: unlockReason,
      })
      .eq('id', id)
      .eq('salon_id', client.salon_id)
      .select('id, blacklist_status, no_show_count, blacklisted_at, blacklist_reason')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ client: updatedClient })
  } catch (error) {
    console.error('[CLIENT_BLACKLIST][DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
