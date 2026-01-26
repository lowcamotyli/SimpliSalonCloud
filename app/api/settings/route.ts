import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const salonId = searchParams.get('salonId')

  if (!salonId) {
    return NextResponse.json({ error: 'salonId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('salon_id', salonId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const supabase = createClient()
  const body = await request.json()
  const { salonId, ...updates } = body

  if (!salonId) {
    return NextResponse.json({ error: 'salonId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('salon_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('salon_id', salonId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}