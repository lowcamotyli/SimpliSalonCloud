import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'
import { createSmsAdapter } from '@/lib/messaging/sms-adapter'

export interface SendSmsInput {
  salonId: string
  messageLogId: string
  to: string
  body: string
  sender?: string
}

export interface SendSmsWithWalletInput {
  salonId: string
  to: string
  body: string
  clientId?: string | null
  sender?: string
}

type SalonSmsSettings = {
  sms_provider?: 'smsapi' | 'bulkgate' | string | null
  smsapi_token?: string | null
  smsapi_sender_name?: string | null
  bulkgate_app_id?: string | null
  bulkgate_app_token?: string | null
}

export function normalizePolishPhoneToE164(phone: string): string {
  const trimmed = phone.trim()
  const normalizedInput = trimmed.replace(/[\s\-().]/g, '')

  if (normalizedInput.startsWith('+')) {
    const normalizedPlus = `+${normalizedInput.slice(1).replace(/\D/g, '')}`
    if (/^\+[1-9]\d{7,14}$/.test(normalizedPlus)) {
      return normalizedPlus
    }
    throw new Error('Invalid recipient phone number format')
  }

  const digits = normalizedInput.replace(/\D/g, '')

  if (digits.startsWith('48') && digits.length === 11) {
    return `+${digits}`
  }

  if (digits.length === 9) {
    return `+48${digits}`
  }

  throw new Error('Invalid recipient phone number format')
}

function resolveSmsApiToken(rawValue: string | null): string {
  const dbValue = rawValue?.trim() || ''
  const envValue = (process.env.SMSAPI_TOKEN || '').trim()
  const source = dbValue || envValue

  if (!source) {
    throw new Error('SMSAPI token is not configured for this salon')
  }

  if (isEncryptedPayload(source)) {
    return decryptSecret(source)
  }

  return source
}

async function getSalonSmsSettings(supabase: ReturnType<typeof createAdminSupabaseClient>, salonId: string) {
  const { data: settings } = await (supabase as any)
    .from('salon_settings')
    .select('sms_provider, smsapi_token, smsapi_sender_name, bulkgate_app_id, bulkgate_app_token')
    .eq('salon_id', salonId)
    .maybeSingle()

  return (settings || {}) as SalonSmsSettings
}

function resolveSender(inputSender: string | undefined, settings: SalonSmsSettings): string | undefined {
  return (
    inputSender ||
    settings.smsapi_sender_name ||
    process.env.SMS_SENDER_NAME ||
    process.env.SMSAPI_SENDER_NAME ||
    undefined
  )
}

async function updateLog(
  messageLogId: string,
  payload: { status: 'sent' | 'failed'; provider_id?: string | null; error?: string | null; sent_at?: string | null }
) {
  const supabase = createAdminSupabaseClient()
  await (supabase as any).from('message_logs').update(payload).eq('id', messageLogId)
}

export async function sendSms(input: SendSmsWithWalletInput): Promise<{ messageId: string | null; status: 'sent' | 'queued' }> {
  const supabase = createAdminSupabaseClient()
  const to = normalizePolishPhoneToE164(input.to)

  const settings = await getSalonSmsSettings(supabase, input.salonId)
  if ((settings.sms_provider || '').toLowerCase() !== 'bulkgate') {
    resolveSmsApiToken(settings.smsapi_token ?? null)
  }

  // Decrement before sending so balance validation and reservation are atomic, preventing race conditions.
  const { data: decremented, error: decrementError } = await (supabase as any).rpc('decrement_sms_balance', {
    p_salon_id: input.salonId,
  })

  if (decrementError || decremented !== true) {
    throw new Error('INSUFFICIENT_SMS_BALANCE')
  }

  const sender = resolveSender(input.sender, settings)
  const adapter = createSmsAdapter(settings)
  const result = await adapter.send({ to, body: input.body, from: sender })

  await (supabase as any).from('sms_messages').insert({
    salon_id: input.salonId,
    client_id: input.clientId || null,
    direction: 'outbound',
    body: input.body,
    status: result.status,
    provider_message_id: result.messageId,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  return result
}

export async function sendSmsMessage(input: SendSmsInput): Promise<{ providerId: string | null; status: 'sent' }> {
  const supabase = createAdminSupabaseClient()

  try {
    const settings = await getSalonSmsSettings(supabase, input.salonId)
    if ((settings.sms_provider || '').toLowerCase() !== 'bulkgate') {
      resolveSmsApiToken(settings.smsapi_token ?? null)
    }

    const sender = resolveSender(input.sender, settings)
    const to = normalizePolishPhoneToE164(input.to)
    const adapter = createSmsAdapter(settings)
    const result = await adapter.send({ to, body: input.body, from: sender })

    await updateLog(input.messageLogId, {
      status: 'sent',
      provider_id: result.messageId,
      error: null,
      sent_at: new Date().toISOString(),
    })

    return { providerId: result.messageId, status: 'sent' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMS send failed'
    if (input.messageLogId) {
      await updateLog(input.messageLogId, {
        status: 'failed',
        error: message,
      })
    }
    throw error
  }
}
