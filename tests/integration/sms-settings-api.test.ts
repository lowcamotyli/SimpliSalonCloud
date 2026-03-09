import { describe, it, expect } from 'vitest'
import { handleGetSmsSettings, handlePutSmsSettings } from '@/app/api/settings/sms/route'

type AnyObj = Record<string, any>

function createSmsSettingsSupabaseMock(options?: {
  authenticated?: boolean
  member?: boolean
  settingsRow?: AnyObj | null
}) {
  const authenticated = options?.authenticated ?? true
  const member = options?.member ?? true
  const settingsRow = options?.settingsRow ?? null

  const state: { upsertPayload: AnyObj | null } = { upsertPayload: null }

  const query = (table: string) => {
    const filters: AnyObj = {}
    let mode: 'read' | 'upsert' = 'read'

    return {
      select() {
        return this
      },
      eq(column: string, value: any) {
        filters[column] = value
        return this
      },
      order() {
        return this
      },
      delete() {
        return this
      },
      insert() {
        return { error: null } // simplified success
      },
      upsert(payload: AnyObj) {
        mode = 'upsert'
        state.upsertPayload = payload
        return this
      },
      maybeSingle: async () => {
        if (table === 'profiles') {
          return { data: member ? { salon_id: filters.salon_id } : null, error: null }
        }

        if (table === 'salon_settings' && mode === 'read') {
          return { data: settingsRow, error: null }
        }

        if (table === 'salon_settings' && mode === 'upsert') {
          return { data: state.upsertPayload, error: null }
        }

        return { data: null, error: null }
      },
      then: (resolve: any) => {
        if (table === 'reminder_rules') {
          resolve({ data: [], error: null })
        } else {
          resolve({ data: null, error: null })
        }
      }
    }
  }

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: 'user-1' } : null },
        error: authenticated ? null : { message: 'auth error' },
      }),
    },
    from: query,
  }

  return { supabase, state }
}

describe('SMS settings API', () => {
  it('GET masks token and returns has_smsapi_token', async () => {
    const { supabase } = createSmsSettingsSupabaseMock({
      settingsRow: {
        salon_id: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
        smsapi_token: 'v1:encrypted:value',
        smsapi_sender_name: 'SalonPL',
      },
    })

    const response = await handleGetSmsSettings(
      new Request('http://localhost/api/settings/sms?salonId=a58bccf5-e159-4cde-b837-1f7d0a0d1797'),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(200)
    const payload = await response!.json()
    expect(payload.smsapi_token).toBe('')
    expect(payload.has_smsapi_token).toBe(true)
    expect(payload.smsapi_sender_name).toBe('SalonPL')
  })

  it('GET returns 401 for unauthorized user', async () => {
    const { supabase } = createSmsSettingsSupabaseMock({ authenticated: false })

    const response = await handleGetSmsSettings(
      new Request('http://localhost/api/settings/sms?salonId=a58bccf5-e159-4cde-b837-1f7d0a0d1797'),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(401)
  })

  it('GET returns 403 when user is not a salon member', async () => {
    const { supabase } = createSmsSettingsSupabaseMock({ member: false })

    const response = await handleGetSmsSettings(
      new Request('http://localhost/api/settings/sms?salonId=a58bccf5-e159-4cde-b837-1f7d0a0d1797'),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(403)
  })

  it('GET returns 400 when salonId is missing', async () => {
    const { supabase } = createSmsSettingsSupabaseMock()

    const response = await handleGetSmsSettings(new Request('http://localhost/api/settings/sms'), {
      createSupabase: async () => supabase as any,
    })

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(400)
  })

  it('PUT supports __UNCHANGED__ sentinel (does not overwrite token)', async () => {
    const { supabase, state } = createSmsSettingsSupabaseMock()

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
          smsapi_token: '__UNCHANGED__',
          smsapi_sender_name: 'Sender11',
        }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(200)
    expect(Boolean(state.upsertPayload)).toBe(true)
    expect('smsapi_token' in (state.upsertPayload || {})).toBe(false)
    expect(state.upsertPayload?.smsapi_sender_name).toBe('Sender11')
  })

  it('PUT encrypts plaintext token before save', async () => {
    process.env.MESSAGING_ENCRYPTION_KEY = '12345678901234567890123456789012'

    const { supabase, state } = createSmsSettingsSupabaseMock()

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
          smsapi_token: 'plain-secret-token',
        }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(200)
    expect(typeof state.upsertPayload?.smsapi_token).toBe('string')
    expect(state.upsertPayload?.smsapi_token.startsWith('v1:')).toBe(true)
    expect(state.upsertPayload?.smsapi_token).not.toBe('plain-secret-token')
  })

  it('PUT returns 401 for unauthorized user', async () => {
    const { supabase } = createSmsSettingsSupabaseMock({ authenticated: false })

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
          smsapi_sender_name: 'Sender11',
        }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(401)
  })

  it('PUT returns 403 when user is not a salon member', async () => {
    const { supabase } = createSmsSettingsSupabaseMock({ member: false })

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
          smsapi_sender_name: 'Sender11',
        }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(403)
  })

  it('PUT returns 400 when salonId is missing', async () => {
    const { supabase } = createSmsSettingsSupabaseMock()

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ smsapi_sender_name: 'Sender11' }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(400)
  })

  it('PUT clears token when empty string is provided', async () => {
    const { supabase, state } = createSmsSettingsSupabaseMock()

    const response = await handlePutSmsSettings(
      new Request('http://localhost/api/settings/sms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: 'a58bccf5-e159-4cde-b837-1f7d0a0d1797',
          smsapi_token: '',
        }),
      }),
      { createSupabase: async () => supabase as any }
    )

    expect(response!).toBeTruthy()
    expect(response!.status).toBe(200)
    expect(state.upsertPayload?.smsapi_token).toBeNull()
  })
})
