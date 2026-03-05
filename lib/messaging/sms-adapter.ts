import { decryptSecret, isEncryptedPayload } from '@/lib/messaging/crypto'

export interface SmsAdapter {
  send(params: {
    to: string
    body: string
    from?: string
  }): Promise<{ messageId: string | null; status: 'queued' | 'sent' }>
}

type SalonSmsSettings = {
  sms_provider?: 'smsapi' | 'bulkgate' | string | null
  smsapi_token?: string | null
  bulkgate_app_id?: string | null
  bulkgate_app_token?: string | null
}

function resolveSecret(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return isEncryptedPayload(trimmed) ? decryptSecret(trimmed) : trimmed
}

function resolveProvider(settings: SalonSmsSettings): 'smsapi' | 'bulkgate' {
  const fromDb = settings.sms_provider?.toLowerCase()
  const fromEnv = process.env.SMS_PROVIDER?.toLowerCase()
  const provider = fromDb || fromEnv || 'smsapi'

  if (provider === 'smsapi' || provider === 'bulkgate') return provider
  throw new Error(`Unknown SMS provider: ${provider}`)
}

class SmsApiAdapter implements SmsAdapter {
  constructor(private readonly token: string) {}

  async send(params: { to: string; body: string; from?: string }) {
    const form = new URLSearchParams()
    form.set('to', params.to)
    form.set('message', params.body)
    form.set('encoding', 'utf-8')
    if (params.from) form.set('from', params.from)

    const response = await fetch('https://api.smsapi.pl/sms.do?format=json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.error) {
      throw new Error(payload?.message || payload?.error || `SMSAPI request failed (${response.status})`)
    }

    const messageId = payload?.list?.[0]?.id || payload?.id || null
    return { messageId, status: 'sent' as const }
  }
}

class BulkGateAdapter implements SmsAdapter {
  constructor(
    private readonly appId: string,
    private readonly appToken: string
  ) {}

  async send(params: { to: string; body: string; from?: string }) {
    const response = await fetch('https://portal.bulkgate.com/api/1.0/simple/transactional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        application_id: this.appId,
        application_token: this.appToken,
        number: params.to,
        text: params.body,
        sender_id: params.from || 'gSystem',
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || (payload?.data?.status && payload.data.status !== 'accepted')) {
      throw new Error(payload?.error || payload?.message || `BulkGate request failed (${response.status})`)
    }

    const messageId = payload?.data?.sms_id || payload?.data?.id || null
    return { messageId, status: 'queued' as const }
  }
}

export function createSmsAdapter(settings: SalonSmsSettings): SmsAdapter {
  const provider = resolveProvider(settings)

  if (provider === 'smsapi') {
    const token = resolveSecret(settings.smsapi_token) || process.env.SMSAPI_TOKEN || ''
    if (!token) throw new Error('SMSAPI token is not configured')
    return new SmsApiAdapter(token)
  }

  const appId = resolveSecret(settings.bulkgate_app_id) || process.env.BULKGATE_APP_ID || ''
  const appToken = resolveSecret(settings.bulkgate_app_token) || process.env.BULKGATE_APP_TOKEN || ''
  if (!appId || !appToken) throw new Error('BulkGate credentials are not configured')
  return new BulkGateAdapter(appId, appToken)
}
