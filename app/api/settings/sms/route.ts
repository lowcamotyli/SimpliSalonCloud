import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { MASKED_SECRET, updateSmsSettingsSchema } from '@/lib/validators/settings.validators'

function sanitizeSmsSecrets<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    smsapi_token: '',
    bulkgate_app_token: '',
    has_smsapi_token: !!data?.smsapi_token,
    has_bulkgate_app_token: !!data?.bulkgate_app_token,
  }
}

function protectSecretField(next: Record<string, any>, field: 'smsapi_token' | 'bulkgate_app_token') {
  if (!(field in next)) return

  const value = next[field]
  if (typeof value !== 'string') return

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

function prepareSmsCredentialUpdates(updates: Record<string, any>) {
  const next = { ...updates }
  protectSecretField(next, 'smsapi_token')
  protectSecretField(next, 'bulkgate_app_token')
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
      .select('salon_id, sms_provider, smsapi_token, smsapi_sender_name, bulkgate_app_id, bulkgate_app_token')
      .eq('salon_id', auth.salonId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: rules, error: rulesError } = await (supabase as any)
      .from('reminder_rules')
      .select('id, hours_before, message_template, require_confirmation, target_blacklisted_only, is_active')
      .eq('salon_id', auth.salonId)
      .order('hours_before', { ascending: false })

    if (rulesError) {
      return NextResponse.json({ error: rulesError.message }, { status: 500 })
    }

    const settings = data || {
      salon_id: auth.salonId,
      sms_provider: 'smsapi',
      smsapi_token: '',
      smsapi_sender_name: '',
      bulkgate_app_id: '',
      bulkgate_app_token: '',
    }

    return NextResponse.json({
      ...sanitizeSmsSecrets(settings),
      reminder_rules: rules || [],
    })
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
    const reminderRules = validatedUpdates.reminder_rules
    const settingsPayload = { ...validatedUpdates } as Record<string, any>
    delete settingsPayload.reminder_rules

    const securedUpdates = prepareSmsCredentialUpdates(settingsPayload)

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
      .select('salon_id, sms_provider, smsapi_token, smsapi_sender_name, bulkgate_app_id, bulkgate_app_token')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (Array.isArray(reminderRules)) {
      const { error: deleteError } = await (supabase as any)
        .from('reminder_rules')
        .delete()
        .eq('salon_id', salonId)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      if (reminderRules.length > 0) {
        const rows = reminderRules.map((rule) => ({
          salon_id: salonId,
          hours_before: rule.hours_before,
          message_template: rule.message_template,
          require_confirmation: rule.require_confirmation,
          target_blacklisted_only: rule.target_blacklisted_only,
          is_active: rule.is_active,
        }))

        const { error: insertError } = await (supabase as any).from('reminder_rules').insert(rows)
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
      }
    }

    const { data: freshRules } = await (supabase as any)
      .from('reminder_rules')
      .select('id, hours_before, message_template, require_confirmation, target_blacklisted_only, is_active')
      .eq('salon_id', salonId)
      .order('hours_before', { ascending: false })

    return NextResponse.json({
      ...(data ? sanitizeSmsSecrets(data) : { salon_id: salonId }),
      reminder_rules: freshRules || [],
    })
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
