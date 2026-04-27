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

function createSingleBookingSupabaseMock(options: {
  salonTimezone?: string | null
  serviceDuration: number
  requiredEquipmentIds: string[]
  employeeId: string
  equipmentAvailabilityByStartIso?: Record<string, boolean>
}) {
  const rpcCalls: Array<{ fnName: string; args: Record<string, unknown> }> = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'salon_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  terms_text: null,
                  terms_url: null,
                  timezone: options.salonTimezone ?? null,
                },
                error: null,
              }),
            })),
          })),
        }
      }

      if (table === 'services') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { duration: options.serviceDuration, price: 100, price_type: null },
                  error: null,
                }),
              })),
            })),
          })),
        }
      }

      if (table === 'service_equipment') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: options.requiredEquipmentIds.map((equipmentId) => ({ equipment_id: equipmentId })),
                error: null,
              })
            ),
          })),
        }
      }

      if (table === 'clients') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'client-1', email: null },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
          insert: vi.fn(),
          update: vi.fn(),
        }
      }

      if (table === 'employees') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: options.employeeId },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'bookings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    is: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'booking-1',
                  status: 'scheduled',
                  booking_date: '2026-05-10',
                  booking_time: '10:00',
                },
                error: null,
              }),
            })),
          })),
        }
      }

      if (table === 'equipment_bookings') {
        return {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    rpc: vi.fn(async (fnName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fnName, args })

      if (fnName === 'check_equipment_availability') {
        const ids = (args.p_equipment_ids as string[]) ?? []
        const startsAt = typeof args.p_starts_at === 'string' ? args.p_starts_at : ''
        const isAvailableForRange = options.equipmentAvailabilityByStartIso?.[startsAt]
        return {
          data: ids.map((equipmentId) => ({
            equipment_id: equipmentId,
            is_available: isAvailableForRange ?? true,
            conflict_booking_id: null,
          })),
          error: null,
        }
      }

      if (fnName === 'generate_client_code') {
        return {
          data: 'C000001',
          error: null,
        }
      }

      throw new Error(`Unexpected RPC ${fnName}`)
    }),
  }

  return { supabase, rpcCalls }
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

  it('uses salon local slot converted to UTC for equipment availability checks', async () => {
    const employeeId = '123e4567-e89b-42d3-a456-426614174100'
    const { supabase, rpcCalls } = createSingleBookingSupabaseMock({
      salonTimezone: 'Europe/Warsaw',
      serviceDuration: 30,
      requiredEquipmentIds: ['eq-1'],
      employeeId,
      equipmentAvailabilityByStartIso: {
        '2026-05-10T08:00:00.000Z': false,
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      new NextRequest('http://localhost/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Anna Kowalska',
          phone: '+48123456789',
          serviceId: '123e4567-e89b-42d3-a456-426614174000',
          employeeId,
          date: '2026-05-10',
          time: '10:00',
          terms_accepted: true,
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Time slot not available' })

    const equipmentCheckCall = rpcCalls.find(({ fnName }) => fnName === 'check_equipment_availability')
    expect(equipmentCheckCall?.args.p_starts_at).toBe('2026-05-10T08:00:00.000Z')
    expect(equipmentCheckCall?.args.p_ends_at).toBe('2026-05-10T08:30:00.000Z')
  })
})
