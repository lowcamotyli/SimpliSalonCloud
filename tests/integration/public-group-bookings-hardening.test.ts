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

import { POST } from '@/app/api/public/bookings/group/route'

type GroupTestItem = {
  serviceId: string
  employeeId: string
  date: string
  time: string
}

type SupabaseMockOptions = {
  termsText?: string | null
  termsUrl?: string | null
  salonTimezone?: string | null
  servicesById?: Record<string, { duration: number; price: number; price_type?: string | null }>
  equipmentByServiceId?: Record<string, string[]>
  employees?: string[]
  rpcBookings?: Array<{ id: string }>
  equipmentAvailabilityByStartIso?: Record<string, boolean>
}

function createGroupSupabaseMock(options: SupabaseMockOptions): {
  supabase: {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  }
  equipmentBookingRows: Array<Array<Record<string, string>>>
  rpcCalls: Array<{ fnName: string; args: Record<string, unknown> }>
} {
  const equipmentBookingRows: Array<Array<Record<string, string>>> = []
  const rpcCalls: Array<{ fnName: string; args: Record<string, unknown> }> = []

  const servicesById = options.servicesById ?? {}
  const equipmentByServiceId = options.equipmentByServiceId ?? {}
  const employeeSet = new Set(options.employees ?? [])

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'salon_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  terms_text: options.termsText ?? null,
                  terms_url: options.termsUrl ?? null,
                  timezone: options.salonTimezone ?? null,
                },
                error: null,
              }),
            })),
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

      if (table === 'services') {
        let currentServiceId = ''
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => {
              if (column === 'id') {
                currentServiceId = value
              }
              return {
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: servicesById[currentServiceId] ?? null,
                    error: null,
                  }),
                })),
              }
            }),
          })),
        }
      }

      if (table === 'employees') {
        let currentEmployeeId = ''
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => {
              if (column === 'id') {
                currentEmployeeId = value
              }
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({
                        data: employeeSet.has(currentEmployeeId) ? { id: currentEmployeeId } : null,
                        error: null,
                      }),
                    })),
                  })),
                })),
              }
            }),
          })),
        }
      }

      if (table === 'service_equipment') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, value: string) =>
              Promise.resolve({
                data: (equipmentByServiceId[value] ?? []).map((equipmentId) => ({ equipment_id: equipmentId })),
                error: null,
              })
            ),
          })),
        }
      }

      if (table === 'equipment_bookings') {
        return {
          insert: vi.fn(async (rows: Array<Record<string, string>>) => {
            equipmentBookingRows.push(rows)
            return { data: rows, error: null }
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

      if (fnName === 'create_group_booking_atomic') {
        return {
          data: {
            visit_group_id: 'visit-group-1',
            bookings: options.rpcBookings ?? [],
          },
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

  return { supabase, equipmentBookingRows, rpcCalls }
}

function createGroupBookingRequest(items: GroupTestItem[], extraBody?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/public/bookings/group', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Anna Kowalska',
      phone: '+48123456789',
      items,
      ...extraBody,
    }),
  })
}

describe('public group bookings hardening regressions', () => {
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

  it('returns 422 terms_not_accepted when terms are required and terms_accepted is missing', async () => {
    const { supabase } = createGroupSupabaseMock({
      termsText: 'Akceptuję regulamin',
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      createGroupBookingRequest([
        {
          serviceId: '123e4567-e89b-42d3-a456-426614174000',
          employeeId: '123e4567-e89b-42d3-a456-426614174100',
          date: '2026-05-10',
          time: '09:30',
        },
      ])
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'terms_not_accepted' })
  })

  it('persists equipment_bookings timestamps using request slot and service duration', async () => {
    const item: GroupTestItem = {
      serviceId: '123e4567-e89b-42d3-a456-426614174000',
      employeeId: '123e4567-e89b-42d3-a456-426614174100',
      date: '2026-05-10',
      time: '09:30',
    }

    const { supabase, equipmentBookingRows } = createGroupSupabaseMock({
      servicesById: {
        [item.serviceId]: { duration: 45, price: 100 },
      },
      equipmentByServiceId: {
        [item.serviceId]: ['eq-1'],
      },
      employees: [item.employeeId],
      rpcBookings: [{ id: 'booking-1' }],
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      createGroupBookingRequest([item], {
        terms_accepted: true,
      })
    )

    expect(response.status).toBe(201)
    expect(equipmentBookingRows).toHaveLength(1)
    expect(equipmentBookingRows[0]).toEqual([
      {
        booking_id: 'booking-1',
        equipment_id: 'eq-1',
        starts_at: '2026-05-10T09:30:00.000Z',
        ends_at: '2026-05-10T10:15:00.000Z',
      },
    ])
  })

  it('passes terms_accepted_at into group booking RPC so it is stored per booking', async () => {
    const item: GroupTestItem = {
      serviceId: '123e4567-e89b-42d3-a456-426614174010',
      employeeId: '123e4567-e89b-42d3-a456-426614174110',
      date: '2026-05-11',
      time: '14:00',
    }

    const { supabase, rpcCalls } = createGroupSupabaseMock({
      servicesById: {
        [item.serviceId]: { duration: 30, price: 110 },
      },
      employees: [item.employeeId],
      rpcBookings: [{ id: 'booking-terms-1' }],
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      createGroupBookingRequest([item], {
        terms_accepted: true,
      })
    )

    expect(response.status).toBe(201)
    const createGroupCall = rpcCalls.find(({ fnName }) => fnName === 'create_group_booking_atomic')
    expect(createGroupCall).toBeDefined()
    expect(createGroupCall?.args.p_terms_accepted_at).toEqual(expect.any(String))
  })

  it('does not mix equipment slots across multi-item group bookings', async () => {
    const items: GroupTestItem[] = [
      {
        serviceId: '123e4567-e89b-42d3-a456-426614174000',
        employeeId: '123e4567-e89b-42d3-a456-426614174100',
        date: '2026-05-12',
        time: '08:00',
      },
      {
        serviceId: '123e4567-e89b-42d3-a456-426614174001',
        employeeId: '123e4567-e89b-42d3-a456-426614174101',
        date: '2026-05-12',
        time: '11:30',
      },
    ]

    const { supabase, equipmentBookingRows } = createGroupSupabaseMock({
      servicesById: {
        [items[0].serviceId]: { duration: 30, price: 90 },
        [items[1].serviceId]: { duration: 60, price: 140 },
      },
      equipmentByServiceId: {
        [items[0].serviceId]: ['eq-1'],
        [items[1].serviceId]: ['eq-2', 'eq-3'],
      },
      employees: [items[0].employeeId, items[1].employeeId],
      rpcBookings: [{ id: 'booking-a' }, { id: 'booking-b' }],
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      createGroupBookingRequest(items, {
        terms_accepted: true,
      })
    )

    expect(response.status).toBe(201)
    expect(equipmentBookingRows).toHaveLength(2)
    expect(equipmentBookingRows[0]).toEqual([
      {
        booking_id: 'booking-a',
        equipment_id: 'eq-1',
        starts_at: '2026-05-12T08:00:00.000Z',
        ends_at: '2026-05-12T08:30:00.000Z',
      },
    ])
    expect(equipmentBookingRows[1]).toEqual([
      {
        booking_id: 'booking-b',
        equipment_id: 'eq-2',
        starts_at: '2026-05-12T11:30:00.000Z',
        ends_at: '2026-05-12T12:30:00.000Z',
      },
      {
        booking_id: 'booking-b',
        equipment_id: 'eq-3',
        starts_at: '2026-05-12T11:30:00.000Z',
        ends_at: '2026-05-12T12:30:00.000Z',
      },
    ])
  })

  it('returns item conflict when local salon slot is occupied in non-UTC timezone', async () => {
    const item: GroupTestItem = {
      serviceId: '123e4567-e89b-42d3-a456-426614174020',
      employeeId: '123e4567-e89b-42d3-a456-426614174120',
      date: '2026-05-10',
      time: '10:00',
    }

    const { supabase, rpcCalls } = createGroupSupabaseMock({
      salonTimezone: 'Europe/Warsaw',
      servicesById: {
        [item.serviceId]: { duration: 30, price: 120 },
      },
      equipmentByServiceId: {
        [item.serviceId]: ['eq-1'],
      },
      employees: [item.employeeId],
      rpcBookings: [{ id: 'booking-conflict-1' }],
      equipmentAvailabilityByStartIso: {
        '2026-05-10T08:00:00.000Z': false,
      },
    })
    createAdminSupabaseClientMock.mockReturnValue(supabase)

    const response = await POST(
      createGroupBookingRequest([item], {
        terms_accepted: true,
      })
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Time slot not available', conflictingItemIndex: 0 })
    const equipmentCheckCall = rpcCalls.find(({ fnName }) => fnName === 'check_equipment_availability')
    expect(equipmentCheckCall?.args.p_starts_at).toBe('2026-05-10T08:00:00.000Z')
    expect(equipmentCheckCall?.args.p_ends_at).toBe('2026-05-10T08:30:00.000Z')
  })
})
