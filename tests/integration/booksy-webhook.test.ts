import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { handleBooksyWebhook } from '@/app/api/webhooks/booksy/handler'

const BOOKSY_SECRET = 'booksy_test_secret'

function makeRequest(body: string, headers?: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/webhooks/booksy', {
    method: 'POST',
    body,
    headers,
  })
}

test('Booksy webhook: rejects when secret is missing on server', async () => {
  const response = await handleBooksyWebhook(
    makeRequest(JSON.stringify({ salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8', emails: [] })),
    {
      getWebhookSecret: () => undefined,
      createProcessor: () => ({
        processEmail: async () => ({ success: true }),
      }),
    }
  )

  assert.equal(response.status, 500)
  const payload = await response.json()
  assert.equal(payload.error, 'BOOKSY_WEBHOOK_SECRET is not configured')
})

test('Booksy webhook: rejects unauthorized request', async () => {
  const response = await handleBooksyWebhook(
    makeRequest(JSON.stringify({ salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8', emails: [] })),
    {
      getWebhookSecret: () => BOOKSY_SECRET,
      createProcessor: () => ({
        processEmail: async () => ({ success: true }),
      }),
    }
  )

  assert.equal(response.status, 401)
  const payload = await response.json()
  assert.equal(payload.error, 'Unauthorized')
})

test('Booksy webhook: rejects invalid JSON payload', async () => {
  const response = await handleBooksyWebhook(
    makeRequest('{invalid-json', {
      'x-booksy-webhook-secret': BOOKSY_SECRET,
      'content-type': 'application/json',
    }),
    {
      getWebhookSecret: () => BOOKSY_SECRET,
      createProcessor: () => ({
        processEmail: async () => ({ success: true }),
      }),
    }
  )

  assert.equal(response.status, 400)
  const payload = await response.json()
  assert.equal(payload.error, 'Invalid JSON payload')
})

test('Booksy webhook: validates payload schema', async () => {
  const response = await handleBooksyWebhook(
    makeRequest(
      JSON.stringify({
        salonId: 'not-a-uuid',
        emails: [{ subject: 'x', body: '' }],
      }),
      {
        'x-booksy-webhook-secret': BOOKSY_SECRET,
      }
    ),
    {
      getWebhookSecret: () => BOOKSY_SECRET,
      createProcessor: () => ({
        processEmail: async () => ({ success: true }),
      }),
    }
  )

  assert.equal(response.status, 400)
  const payload = await response.json()
  assert.equal(payload.error, 'Invalid webhook payload')
  assert.equal(Array.isArray(payload.details), true)
})

test('Booksy webhook: processes emails, forwards eventId, aggregates results and preserves tenant salonId', async () => {
  const calls: Array<{ salonId: string; subject: string; body: string; eventId?: string }> = []

  const response = await handleBooksyWebhook(
    makeRequest(
      JSON.stringify({
        salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8',
        emails: [
          { id: 'evt-1', subject: 'A: nowa rezerwacja', body: 'email-a' },
          { id: 'evt-2', subject: 'B: nowa rezerwacja', body: 'email-b' },
        ],
      }),
      {
        authorization: `Bearer ${BOOKSY_SECRET}`,
      }
    ),
    {
      getWebhookSecret: () => BOOKSY_SECRET,
      createProcessor: (salonId: string) => ({
        processEmail: async (subject: string, body: string, options?: { eventId?: string }) => {
          calls.push({ salonId, subject, body, eventId: options?.eventId })
          return { success: subject.includes('A') }
        },
      }),
    }
  )

  assert.equal(response.status, 200)

  const payload = await response.json()
  assert.equal(payload.success, true)
  assert.equal(payload.processed, 2)
  assert.equal(payload.successful, 1)
  assert.equal(payload.errors, 1)

  assert.deepEqual(calls, [
    {
      salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8',
      subject: 'A: nowa rezerwacja',
      body: 'email-a',
      eventId: 'evt-1',
    },
    {
      salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8',
      subject: 'B: nowa rezerwacja',
      body: 'email-b',
      eventId: 'evt-2',
    },
  ])
})

