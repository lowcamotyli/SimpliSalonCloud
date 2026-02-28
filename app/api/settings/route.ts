import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateSettingsSchema } from '@/lib/validators/settings.validators'
import { encryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { z } from 'zod'

const MASKED_SECRET = '********'

function sanitizeSecrets<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    resend_api_key: '',
    smsapi_token: '',
    p24_crc: '',
    p24_api_key: '',
    has_resend_api_key: !!data?.resend_api_key,
    has_smsapi_token: !!data?.smsapi_token,
    has_p24_crc: !!data?.p24_crc,
    has_p24_api_key: !!data?.p24_api_key,
  }
}

type SecretField = 'resend_api_key' | 'smsapi_token' | 'p24_crc' | 'p24_api_key'

function prepareEncryptedCredentialUpdates(updates: Record<string, any>) {
  const next = { ...updates }

  const handleCredential = (field: SecretField) => {
    if (!(field in next)) return

    const value = next[field]

    if (typeof value !== 'string') {
      return
    }

    const trimmed = value.trim()

    if (!trimmed) {
      next[field] = null
      return
    }

    if (trimmed === MASKED_SECRET || trimmed === '__UNCHANGED__') {
      delete next[field]
      return
    }

    if (isEncryptedPayload(trimmed)) {
      next[field] = trimmed
      return
    }

    next[field] = encryptSecret(trimmed)
  }

  handleCredential('resend_api_key')
  handleCredential('smsapi_token')
  handleCredential('p24_crc')
  handleCredential('p24_api_key')

  return next
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const salonId = searchParams.get('salonId')

    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (membershipError) {
      console.error('[SETTINGS] GET membership error:', membershipError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('salon_settings')
      .select('*')
      .eq('salon_id', salonId)
      .maybeSingle()

    if (error) {
      console.error('[SETTINGS] GET query error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!data) {
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
        contact_email: '',
        accounting_email: '',
        contact_phone: '',
        resend_api_key: '',
        resend_from_email: '',
        resend_from_name: '',
        smsapi_token: '',
        smsapi_sender_name: '',
        has_resend_api_key: false,
        has_smsapi_token: false,
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

    return NextResponse.json(sanitizeSecrets(data))
  } catch (err) {
    console.error('[SETTINGS] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const body = await request.json()
    const salonId = body.salonId as string
    const updates = { ...body }
    delete updates.salonId

    if (!salonId) {
      return NextResponse.json({ error: 'salonId required' }, { status: 400 })
    }

    const validatedUpdates = updateSettingsSchema.parse(updates)
    const securedUpdates = prepareEncryptedCredentialUpdates(validatedUpdates as Record<string, any>)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id, role')
      .eq('user_id', user.id)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (membershipError) {
      console.error('[SETTINGS] PATCH membership error:', membershipError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await (supabase
      .from('salon_settings') as any)
      .upsert({
        salon_id: salonId,
        ...securedUpdates,
        updated_at: new Date().toISOString()
      }, { onConflict: 'salon_id' })
      .select()
      .maybeSingle() as any

    if (error) {
      console.error('[SETTINGS] PATCH upsert error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json(data ? sanitizeSecrets(data) : data)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.errors },
        { status: 400 }
      )
    }
    console.error('[SETTINGS] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
