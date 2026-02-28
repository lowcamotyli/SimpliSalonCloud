import test from 'node:test'
import assert from 'node:assert/strict'
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

test('SMS settings GET masks token and returns has_smsapi_token', async () => {
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
  )!

  assert.ok(response)

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.smsapi_token, '')
  assert.equal(payload.has_smsapi_token, true)
  assert.equal(payload.smsapi_sender_name, 'SalonPL')
})

test('SMS settings GET returns 401 for unauthorized user', async () => {
  const { supabase } = createSmsSettingsSupabaseMock({ authenticated: false })

  const response = await handleGetSmsSettings(
    new Request('http://localhost/api/settings/sms?salonId=a58bccf5-e159-4cde-b837-1f7d0a0d1797'),
    { createSupabase: async () => supabase as any }
  )!

  assert.ok(response)
  assert.equal(response.status, 401)
})

test('SMS settings GET returns 403 when user is not a salon member', async () => {
  const { supabase } = createSmsSettingsSupabaseMock({ member: false })

  const response = await handleGetSmsSettings(
    new Request('http://localhost/api/settings/sms?salonId=a58bccf5-e159-4cde-b837-1f7d0a0d1797'),
    { createSupabase: async () => supabase as any }
  )!

  assert.ok(response)
  assert.equal(response.status, 403)
})

test('SMS settings GET returns 400 when salonId is missing', async () => {
  const { supabase } = createSmsSettingsSupabaseMock()

  const response = await handleGetSmsSettings(new Request('http://localhost/api/settings/sms'), {
    createSupabase: async () => supabase as any,
  })!

  assert.ok(response)
  assert.equal(response.status, 400)
})

test('SMS settings PUT supports __UNCHANGED__ sentinel (does not overwrite token)', async () => {
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
  )!

  assert.ok(response)

  assert.equal(response.status, 200)
  assert.equal(Boolean(state.upsertPayload), true)
  assert.equal('smsapi_token' in (state.upsertPayload || {}), false)
  assert.equal(state.upsertPayload?.smsapi_sender_name, 'Sender11')
})

test('SMS settings PUT encrypts plaintext token before save', async () => {
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
  )!

  assert.ok(response)

  assert.equal(response.status, 200)
  assert.equal(typeof state.upsertPayload?.smsapi_token, 'string')
  assert.equal(state.upsertPayload?.smsapi_token.startsWith('v1:'), true)
  assert.notEqual(state.upsertPayload?.smsapi_token, 'plain-secret-token')
})

test('SMS settings PUT returns 401 for unauthorized user', async () => {
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
  )!

  assert.ok(response)
  assert.equal(response.status, 401)
})

test('SMS settings PUT returns 403 when user is not a salon member', async () => {
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
  )!

  assert.ok(response)
  assert.equal(response.status, 403)
})

test('SMS settings PUT returns 400 when salonId is missing', async () => {
  const { supabase } = createSmsSettingsSupabaseMock()

  const response = await handlePutSmsSettings(
    new Request('http://localhost/api/settings/sms', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ smsapi_sender_name: 'Sender11' }),
    }),
    { createSupabase: async () => supabase as any }
  )!

  assert.ok(response)
  assert.equal(response.status, 400)
})

test('SMS settings PUT clears token when empty string is provided', async () => {
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
  )!

  assert.ok(response)
  assert.equal(response.status, 200)
  assert.equal(state.upsertPayload?.smsapi_token, null)
})

