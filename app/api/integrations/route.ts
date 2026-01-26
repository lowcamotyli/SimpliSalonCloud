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
    .from('integration_configs')
    .select('*')
    .eq('salon_id', salonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}