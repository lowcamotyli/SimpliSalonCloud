import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  console.log('=== SETTINGS API GET START ===')

  try {
    console.log('1. Creating Supabase client...')
    const supabase = await createServerSupabaseClient()
    console.log('2. Supabase client created successfully')

    const { searchParams } = new URL(request.url)
    const salonId = searchParams.get('salonId')
    console.log('3. SalonId from request:', salonId)

    if (!salonId) {
      console.log('ERROR: No salonId provided')
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    console.log('4. Querying salon_settings table...')
    const { data, error } = await supabase
      .from('salon_settings')
      .select('*')
      .eq('salon_id', salonId)
      .maybeSingle()

    console.log('5. Query result:', { data: !!data, error: error?.message })

    if (error) {
      console.log('ERROR from Supabase:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      console.log('6. No data found, returning default settings')
      const defaultSettings = {
        salon_id: salonId,
        theme: 'beauty_salon',
        font_family: 'Inter',
        business_type: 'beauty_salon',
        booking_window_days: 60,
        min_notice_hours: 2,
        slot_duration_minutes: 30,
        allow_waitlist: true,
        require_deposit: false,
        currency: 'PLN',
        language: 'pl',
        timezone: 'Europe/Warsaw',
        operating_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
          wednesday: { open: '09:00', close: '17:00', closed: false },
          thursday: { open: '09:00', close: '17:00', closed: false },
          friday: { open: '09:00', close: '17:00', closed: false },
          saturday: { open: '10:00', close: '14:00', closed: false },
          sunday: { open: null, close: null, closed: true }
        },
        closures: [],
        notification_settings: {
          clientReminders: { enabled: true, timing: [24], channels: ['email', 'sms'] },
          clientConfirmations: { enabled: true, channels: ['email', 'sms'] },
          newBooking: { enabled: true, channels: ['email'] },
          cancellation: { enabled: true, channels: ['email'] },
          dailySummary: { enabled: false, time: '20:00', recipients: [] }
        }
      }
      return NextResponse.json(defaultSettings)
    }

    console.log('6. Success! Returning data')
    return NextResponse.json(data)
  } catch (err) {
    console.log('CATCH ERROR:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  console.log('=== SETTINGS API PATCH START ===')

  try {
    const supabase = await createServerSupabaseClient()
    const body = await request.json()
    const { salonId, ...updates } = body

    console.log('PATCH salonId:', salonId)
    console.log('PATCH updates:', Object.keys(updates))

    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('PATCH User ID:', user?.id)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('salon_settings')
      .upsert({
        salon_id: salonId,
        ...updates,
        updated_at: new Date().toISOString()
      }, { onConflict: 'salon_id' })
      .select()
      .maybeSingle()

    console.log('PATCH Result Data:', data)

    if (error) {
      console.log('PATCH ERROR:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('PATCH Success confirmed')
    return NextResponse.json(data)
  } catch (err) {
    console.log('PATCH CATCH ERROR:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}