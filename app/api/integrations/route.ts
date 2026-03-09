import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { supabase, salonId } = await getAuthContext()

    const { data: configs, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('salon_id', salonId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result: any[] = [...(configs || [])]

    const { data: settings } = await (supabase as any)
      .from('salon_settings')
      .select('booksy_enabled, booksy_gmail_email')
      .eq('salon_id', salonId)
      .single()

    if (settings?.booksy_enabled && settings?.booksy_gmail_email) {
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
