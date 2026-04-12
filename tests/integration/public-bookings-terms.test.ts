import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const {
  resolveApiKeyMock,
  createAdminSupabaseClientMock,
  checkPublicApiRateLimitMock,
  getClientIpMock,
  validateClientCanBookMock,
  setCorsHeadersMock,
} = vi.hoisted(() => ({
  resolveApiKeyMock: vi.fn(),
  createAdminSupabaseClientMock: vi.fn(),
  checkPublicApiRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  validateClientCanBookMock: vi.fn(),
  setCorsHeadersMock: vi.fn(),
}))

vi.mock('@/lib/middleware/api-key-auth', () => ({
  resolveApiKey: resolveApiKeyMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

vi.mock('@/lib/middleware/rate-limit', () => ({
  checkPublicApiRateLimit: checkPublicApiRateLimitMock,
  getClientIp: getClientIpMock,
}))

vi.mock('@/lib/booking/validation', () => ({
  validateClientCanBook: validateClientCanBookMock,
}))

vi.mock('@/lib/middleware/cors', () => ({
  setCorsHeaders: setCorsHeadersMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { POST } from '@/app/api/public/bookings/route'

function createSalonSettingsClient(settings: { terms_text?: string | null; terms_url?: string | null }) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'salon_settings') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: settings,
              error: null,
            }),
          })),
        })),
      }
    }),
  }
}

describe('public bookings terms gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClientIpMock.mockReturnValue('127.0.0.1')
    checkPublicApiRateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    })
    resolveApiKeyMock.mockResolvedValue({ salonId: 'salon-1' })
    validateClientCanBookMock.mockResolvedValue({ allowed: true })
    setCorsHeadersMock.mockImplementation((_request: NextRequest, response: NextResponse) => response)
  })

  it('returns 422 when salon terms exist and request does not confirm acceptance', async () => {
    createAdminSupabaseClientMock.mockReturnValue(
      createSalonSettingsClient({ terms_text: 'Akceptuję regulamin', terms_url: null })
    )

    const response = await POST(
      new NextRequest('http://localhost/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Anna Kowalska',
          phone: '+48123456789',
          serviceId: '123e4567-e89b-42d3-a456-426614174000',
          date: '2026-04-09',
          time: '10:00',
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toEqual({ error: 'terms_not_accepted' })
  })

  it('returns 400 for invalid JSON body before deeper booking flow starts', async () => {
    createAdminSupabaseClientMock.mockReturnValue(
      createSalonSettingsClient({ terms_text: null, terms_url: null })
    )

    const response = await POST(
      new NextRequest('http://localhost/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"broken":',
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON body' })
  })
})
