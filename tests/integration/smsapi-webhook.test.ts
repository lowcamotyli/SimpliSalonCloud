import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { GET, POST, handleSmsApiWebhook } from '@/app/api/webhooks/smsapi/route'

let requestSeq = 0

function signHeaders(
  body: string,
  secret: string,
  timestamp = `${Date.now()}`,
  eventId?: string
): Record<string, string> {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')

  return {
    'x-smsapi-timestamp': timestamp,
    'x-smsapi-signature': signature,
    'x-smsapi-event-id': eventId || `evt-${timestamp}-${++requestSeq}`,
  }
}

function makeRequest(form: Record<string, string>, headers?: Record<string, string>, query?: string) {
  const body = new URLSearchParams(form)
  const url = `http://localhost:3000/api/webhooks/smsapi${query ? `?${query}` : ''}`
  return new NextRequest(url, {
    method: 'POST',
    body,
    headers,
  })
}

function createSupabaseMock(updatedRows: Array<{ id: string }> = [{ id: 'row-1' }]) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                select: async () => ({ data: updatedRows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

test('SMSAPI webhook rejects unauthorized callback', async () => {
  const response = await handleSmsApiWebhook(
    makeRequest({
      id: 'provider-1',
      message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
      salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
      status: 'DELIVERED',
    }),
    {
      createSupabase: () => createSupabaseMock() as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.equal(payload.error, 'Unauthorized')
})

test('SMSAPI webhook rejects callback with invalid token', async () => {
  const body = new URLSearchParams({
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }).toString()

  const response = await handleSmsApiWebhook(
    makeRequest(
      {
        id: 'provider-1',
        message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
        salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
        status: 'DELIVERED',
      },
      { ...signHeaders(body, 'wrong-secret') }
    ),
    {
      createSupabase: () => createSupabaseMock() as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.equal(payload.error, 'Unauthorized')
})

test('SMSAPI webhook updates exactly one row for valid callback', async () => {
  const body = new URLSearchParams({
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }).toString()

  const response = await handleSmsApiWebhook(
    makeRequest(
      {
        id: 'provider-1',
        message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
        salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
        status: 'DELIVERED',
      },
      { ...signHeaders(body, 'webhook-secret') }
    ),
    {
      createSupabase: () => createSupabaseMock() as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
})

test('SMSAPI webhook rejects ambiguous multi-row update', async () => {
  const body = new URLSearchParams({
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }).toString()

  const response = await handleSmsApiWebhook(
    makeRequest(
      {
        id: 'provider-1',
        message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
        salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
        status: 'DELIVERED',
      },
      { ...signHeaders(body, 'webhook-secret') }
    ),
    {
      createSupabase: () => createSupabaseMock([{ id: 'row-1' }, { id: 'row-2' }]) as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 409)
  const payload = await response.json()
  assert.equal(payload.error, 'Ambiguous webhook update target')
})

// SECURITY REGRESSION TEST: GET must be blocked at route level (405)
test('SMSAPI webhook GET transport is rejected with 405', async () => {
  const response = await GET()
  assert.equal(response.status, 405)
})

// SECURITY REGRESSION TEST: token in query param must be rejected (header only)
test('SMSAPI webhook rejects token passed as query param', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/webhooks/smsapi?id=provider-1&message_log_id=6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3&salon_id=290f49e7-f3e2-4df3-8461-65620106a4ab&status=DELIVERED&token=webhook-secret',
    { method: 'POST' }
  )
  const response = await handleSmsApiWebhook(request, {
    createSupabase: () => createSupabaseMock() as any,
    getWebhookToken: () => 'webhook-secret',
  })
  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.equal(payload.error, 'Unauthorized')
})

test('SMSAPI webhook malformed payload is ignored (200)', async () => {
  const body = new URLSearchParams({ status: 'UNKNOWN' }).toString()

  const response = await handleSmsApiWebhook(
    makeRequest(
      {
        status: 'UNKNOWN',
      },
      { ...signHeaders(body, 'webhook-secret') }
    ),
    {
      createSupabase: () => createSupabaseMock() as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.ignored, true)
})

test('SMSAPI webhook route exports POST handler', async () => {
  process.env.SMSAPI_WEBHOOK_TOKEN = 'webhook-secret'

  const body = new URLSearchParams({
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }).toString()

  const response = await POST(
    makeRequest(
      {
        id: 'provider-1',
        message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
        salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
        status: 'DELIVERED',
      },
      { ...signHeaders(body, 'webhook-secret') }
    )
  )

  assert.equal(response.status, 400)
})

test('SMSAPI webhook route exports GET handler returning 405', async () => {
  const response = await GET()
  assert.equal(response.status, 405)
  const payload = await response.json()
  assert.equal(payload.error, 'Method Not Allowed')
})

test('SMSAPI webhook rejects replayed callback with same event-id', async () => {
  const form = {
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }
  const body = new URLSearchParams(form).toString()
  const headers = signHeaders(body, 'webhook-secret', `${Math.floor(Date.now() / 1000)}`, 'evt-1')

  const first = await handleSmsApiWebhook(makeRequest(form, headers), {
    createSupabase: () => createSupabaseMock() as any,
    getWebhookToken: () => 'webhook-secret',
  })
  assert.equal(first.status, 200)

  const second = await handleSmsApiWebhook(makeRequest(form, headers), {
    createSupabase: () => createSupabaseMock() as any,
    getWebhookToken: () => 'webhook-secret',
  })

  assert.equal(second.status, 409)
  const payload = await second.json()
  assert.equal(payload.error, 'Replay detected')
})

test('SMSAPI webhook rejects stale timestamp outside replay window', async () => {
  const form = {
    id: 'provider-1',
    message_log_id: '6f9b7bdb-c455-4a96-8b3f-e5205f6f1be3',
    salon_id: '290f49e7-f3e2-4df3-8461-65620106a4ab',
    status: 'DELIVERED',
  }
  const body = new URLSearchParams(form).toString()
  const staleTimestamp = `${Date.now() - 10 * 60 * 1000}`

  const response = await handleSmsApiWebhook(
    makeRequest(form, signHeaders(body, 'webhook-secret', staleTimestamp)),
    {
      createSupabase: () => createSupabaseMock() as any,
      getWebhookToken: () => 'webhook-secret',
    }
  )

  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.equal(payload.error, 'Unauthorized')
})
