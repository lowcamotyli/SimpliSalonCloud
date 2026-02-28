import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'

export interface SendSmsInput {
  salonId: string
  messageLogId: string
  to: string
  body: string
  sender?: string
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

async function updateLog(
  messageLogId: string,
  payload: { status: 'sent' | 'failed'; provider_id?: string | null; error?: string | null; sent_at?: string | null }
) {
  const supabase = createAdminSupabaseClient()
  await (supabase as any).from('message_logs').update(payload).eq('id', messageLogId)
}

export async function sendSmsMessage(input: SendSmsInput): Promise<{ providerId: string | null; status: 'sent' }> {
  const supabase = createAdminSupabaseClient()

  try {
    const { data: settings } = await (supabase as any)
      .from('salon_settings')
      .select('smsapi_token, smsapi_sender_name')
      .eq('salon_id', input.salonId)
      .maybeSingle()

    const token = resolveSmsApiToken(settings?.smsapi_token ?? null)
    const sender = input.sender || settings?.smsapi_sender_name || process.env.SMSAPI_SENDER_NAME || undefined
    const to = normalizePolishPhoneToE164(input.to)

    const form = new URLSearchParams()
    form.set('to', to)
    form.set('message', input.body)
    if (sender) form.set('from', sender)
    if (process.env.SMSAPI_CALLBACK_URL) {
      const callbackUrl = new URL(process.env.SMSAPI_CALLBACK_URL)
      callbackUrl.searchParams.set('message_log_id', input.messageLogId)
      callbackUrl.searchParams.set('salon_id', input.salonId)
      form.set('callback', callbackUrl.toString())
    }

    const response = await fetch('https://api.smsapi.pl/sms.do?format=json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    const payload: any = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `SMSAPI request failed (${response.status})`)
    }

    const providerId = payload?.list?.[0]?.id || payload?.id || null

    await updateLog(input.messageLogId, {
      status: 'sent',
      provider_id: providerId,
      error: null,
      sent_at: new Date().toISOString(),
    })

    return { providerId, status: 'sent' }
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

