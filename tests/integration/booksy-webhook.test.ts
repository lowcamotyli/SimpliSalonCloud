import { describe, it, expect } from 'vitest'
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

describe('Booksy webhook', () => {
  it('rejects when secret is missing on server', async () => {
    const response = await handleBooksyWebhook(
      makeRequest(JSON.stringify({ salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8', emails: [] })),
      {
        getWebhookSecret: () => undefined,
        createProcessor: () => ({
          processEmail: async () => ({ success: true }),
        }),
      }
    )

    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload.error).toBe('BOOKSY_WEBHOOK_SECRET is not configured')
  })

  it('rejects unauthorized request', async () => {
    const response = await handleBooksyWebhook(
      makeRequest(JSON.stringify({ salonId: 'c0f4c8d8-5ab4-4cfd-8f6d-6e5e7f4da4a8', emails: [] })),
      {
        getWebhookSecret: () => BOOKSY_SECRET,
        createProcessor: () => ({
          processEmail: async () => ({ success: true }),
        }),
      }
    )

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toBe('Unauthorized')
  })

  it('rejects invalid JSON payload', async () => {
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

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toBe('Invalid JSON payload')
  })

  it('validates payload schema', async () => {
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

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toBe('Invalid webhook payload')
    expect(Array.isArray(payload.details)).toBe(true)
  })

  it('processes emails, forwards eventId, aggregates results and preserves tenant salonId', async () => {
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

    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.processed).toBe(2)
    expect(payload.successful).toBe(1)
    expect(payload.errors).toBe(1)

    expect(calls).toEqual([
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
})
