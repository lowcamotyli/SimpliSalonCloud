import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'

export interface SendEmailInput {
  salonId: string
  messageLogId: string
  to: string
  subject: string
  html?: string
  text?: string
  fromEmail?: string
  fromName?: string
}

function resolveResendApiKey(rawValue: string | null): string {
  const dbValue = rawValue?.trim() || ''
  const envValue = (process.env.RESEND_API_KEY || '').trim()

  const source = dbValue || envValue
  if (!source) {
    throw new Error('Resend API key is not configured for this salon')
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

export async function sendEmailMessage(input: SendEmailInput): Promise<{ providerId: string | null; status: 'sent' }> {
  const supabase = createAdminSupabaseClient()

  try {
    const { data: settings } = await (supabase as any)
      .from('salon_settings')
      .select('resend_api_key, resend_from_email, resend_from_name')
      .eq('salon_id', input.salonId)
      .maybeSingle()

    const apiKey = resolveResendApiKey(settings?.resend_api_key ?? null)

    const fromEmail =
      input.fromEmail ||
      settings?.resend_from_email ||
      process.env.RESEND_FROM_EMAIL ||
      ''

    if (!fromEmail) {
      throw new Error('Resend from email is not configured')
    }

    const fromName =
      input.fromName ||
      settings?.resend_from_name ||
      process.env.RESEND_FROM_NAME ||
      ''

    const resend = new Resend(apiKey)
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail
    const textBody = input.text || (input.html ? input.html.replace(/<[^>]+>/g, ' ') : '').trim()

    const result: any = await resend.emails.send({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: textBody || input.subject,
    })

    if (result?.error) {
      throw new Error(result.error.message || 'Resend failed to send email')
    }

    const providerId = result?.data?.id || result?.id || null

    await updateLog(input.messageLogId, {
      status: 'sent',
      provider_id: providerId,
      error: null,
      sent_at: new Date().toISOString(),
    })

    return { providerId, status: 'sent' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email send failed'
    if (input.messageLogId) {
      await updateLog(input.messageLogId, {
        status: 'failed',
        error: message,
      })
    }
    throw error
  }
}

