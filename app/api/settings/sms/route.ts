import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { MASKED_SECRET, updateSmsSettingsSchema } from '@/lib/validators/settings.validators'

function sanitizeSmsSecrets<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    smsapi_token: '',
    has_smsapi_token: !!data?.smsapi_token,
  }
}

function prepareSmsCredentialUpdates(updates: Record<string, any>) {
  const next = { ...updates }

  if (!('smsapi_token' in next)) {
    return next
  }

  const value = next.smsapi_token
  if (typeof value !== 'string') {
    return next
  }

  const trimmed = value.trim()

  if (!trimmed) {
    next.smsapi_token = null
    return next
  }

  if (trimmed === MASKED_SECRET || trimmed === '__UNCHANGED__') {
    delete next.smsapi_token
    return next
  }

  if (isEncryptedPayload(trimmed)) {
    next.smsapi_token = trimmed
    return next
  }

  next.smsapi_token = encryptSecret(trimmed)
  return next
}

async function requireMembership(request: Request, supabase: any) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { searchParams } = new URL(request.url)
  const salonId = searchParams.get('salonId')

  if (!salonId) {
    return { errorResponse: NextResponse.json({ error: 'salonId required' }, { status: 400 }) }
  }

  const { data: membership, error: membershipError } = await (supabase as any)
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (membershipError) {
    return { errorResponse: NextResponse.json({ error: membershipError.message }, { status: 500 }) }
  }

  if (!membership) {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { salonId }
}

type SmsSettingsDeps = {
  createSupabase: typeof createServerSupabaseClient
}

const defaultDeps: SmsSettingsDeps = {
  createSupabase: createServerSupabaseClient,
}

export async function handleGetSmsSettings(request: Request, deps: SmsSettingsDeps = defaultDeps) {
  try {
    const supabase = await deps.createSupabase()
    const auth = await requireMembership(request, supabase)
    if ('errorResponse' in auth) {
      return auth.errorResponse
    }

    const { data, error } = await (supabase as any)
      .from('salon_settings')
      .select('salon_id, smsapi_token, smsapi_sender_name')
      .eq('salon_id', auth.salonId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings = data || {
      salon_id: auth.salonId,
      smsapi_token: '',
      smsapi_sender_name: '',
    }

    return NextResponse.json(sanitizeSmsSecrets(settings))
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function handlePutSmsSettings(request: Request, deps: SmsSettingsDeps = defaultDeps) {
  try {
    const supabase = await deps.createSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const salonId = body?.salonId as string

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
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates = { ...body }
    delete updates.salonId

    const validatedUpdates = updateSmsSettingsSchema.parse(updates)
    const securedUpdates = prepareSmsCredentialUpdates(validatedUpdates as Record<string, any>)

    const { data, error } = await (supabase as any)
      .from('salon_settings')
      .upsert(
        {
          salon_id: salonId,
          ...securedUpdates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'salon_id' }
      )
      .select('salon_id, smsapi_token, smsapi_sender_name')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ? sanitizeSmsSecrets(data) : data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleGetSmsSettings(request)
}

export async function PUT(request: Request) {
  return handlePutSmsSettings(request)
}

