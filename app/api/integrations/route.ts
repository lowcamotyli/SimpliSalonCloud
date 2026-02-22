import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { searchParams } = new URL(request.url)
    const salonId = searchParams.get('salonId')

    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    // Get standard integration_configs
    const { data: configs, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('salon_id', salonId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result: any[] = [...(configs || [])]

    // Also check Booksy status from salon_settings (stored separately)
    const { data: settings } = await (supabase as any)
      .from('salon_settings')
      .select('booksy_enabled, booksy_gmail_email')
      .eq('salon_id', salonId)
      .single()

    if (settings?.booksy_enabled && settings?.booksy_gmail_email) {
      // Only add synthetic entry if not already in integration_configs
      const alreadyPresent = result.some((c: any) => c.integration_type === 'booksy')
      if (!alreadyPresent) {
        result.push({
          id: 'booksy-settings',
          salon_id: salonId,
          integration_type: 'booksy',
          is_active: true,
          config: { email: settings.booksy_gmail_email },
        })
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
