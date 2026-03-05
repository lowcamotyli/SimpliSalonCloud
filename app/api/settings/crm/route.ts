import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const updateSchema = z.object({
  salonId: z.string().uuid(),
  no_show_threshold: z.number().int().min(1).max(10),
  late_cancel_threshold: z.number().int().min(1).max(10),
  window_months: z.number().int().min(1).max(24),
})

async function getMembership(supabase: any, userId: string, salonId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('salon_id, role')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  return data as { salon_id: string; role: string } | null
}

const DEFAULT_SETTINGS = {
  no_show_threshold: 2,
  late_cancel_threshold: 3,
  window_months: 6,
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const salonId = new URL(request.url).searchParams.get('salonId')
    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    const membership = await getMembership(supabase, user.id, salonId)
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: settings, error: settingsError } = await supabase
      .from('blacklist_settings')
      .select('id, salon_id, no_show_threshold, late_cancel_threshold, window_months, updated_at')
      .eq('salon_id', salonId)
      .maybeSingle()

    if (settingsError) throw settingsError

    const { data: blacklistedClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, full_name, phone, no_show_count, blacklisted_at, blacklist_reason, blacklist_status')
      .eq('salon_id', salonId)
      .eq('blacklist_status', 'blacklisted')
      .is('deleted_at', null)
      .order('blacklisted_at', { ascending: false })
      .limit(200)

    if (clientsError) throw clientsError

    return NextResponse.json({
      settings: settings || { salon_id: salonId, ...DEFAULT_SETTINGS },
      blacklistedClients: blacklistedClients || [],
    })
  } catch (error) {
    console.error('[SETTINGS_CRM][GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
    }

    const payload = parsed.data
    const membership = await getMembership(supabase, user.id, payload.salonId)
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('blacklist_settings')
      .upsert({
        salon_id: payload.salonId,
        no_show_threshold: payload.no_show_threshold,
        late_cancel_threshold: payload.late_cancel_threshold,
        window_months: payload.window_months,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'salon_id' })
      .select('id, salon_id, no_show_threshold, late_cancel_threshold, window_months, updated_at')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ settings: updated })
  } catch (error) {
    console.error('[SETTINGS_CRM][PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
