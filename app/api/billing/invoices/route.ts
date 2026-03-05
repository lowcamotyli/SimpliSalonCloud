import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type Membership = {
  salon_id: string | null
  role: string | null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: rawProfile, error: profileError } = await supabase
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const profile = rawProfile as Membership | null

    if (!profile || !profile.salon_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (profile.role !== 'owner' && profile.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .eq('salon_id', profile.salon_id)
      .order('created_at', { ascending: false })

    if (invoicesError) {
      return NextResponse.json({ error: invoicesError.message }, { status: 500 })
    }

    return NextResponse.json({ invoices: invoices ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
