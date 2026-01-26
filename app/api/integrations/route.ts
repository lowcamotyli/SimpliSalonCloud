import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  console.log('=== INTEGRATIONS API GET START ===')
  
  try {
    const supabase = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const salonId = searchParams.get('salonId')
    
    console.log('SalonId:', salonId)

    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('salon_id', salonId)

    console.log('Query result:', { data: !!data, error: error?.message })

    if (error) {
      console.log('ERROR:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.log('CATCH ERROR:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}