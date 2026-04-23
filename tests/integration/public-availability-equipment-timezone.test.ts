import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const {
  resolveApiKeyMock,
  createAdminSupabaseClientMock,
} = vi.hoisted(() => ({
  resolveApiKeyMock: vi.fn(),
  createAdminSupabaseClientMock: vi.fn(),
}))

vi.mock('@/lib/middleware/api-key-auth', () => ({
  resolveApiKey: resolveApiKeyMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

import { GET } from '@/app/api/public/availability/route'

function createAvailabilitySupabaseMock() {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'services') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { duration: 30 },
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
            eq: vi.fn().mockResolvedValue({
              data: [{ equipment_id: 'eq-1' }],
              error: null,
            }),
          })),
        }
      }

      if (table === 'salon_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  timezone: 'Europe/Warsaw',
                  operating_hours: {
                    sunday: { open: '09:00', close: '12:00', closed: false },
                  },
                },
                error: null,
              }),
            })),
          })),
        }
      }

      if (table === 'equipment_bookings') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              lt: vi.fn(() => ({
                gt: vi.fn().mockResolvedValue({
                  data: [
                    {
                      starts_at: '2026-05-10T08:00:00.000Z',
                      ends_at: '2026-05-10T08:30:00.000Z',
                    },
                  ],
                  error: null,
                }),
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
                not: vi.fn(() => ({
                  is: vi.fn(() => ({
                    eq: vi.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'employee_schedules') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    day_of_week: 0,
                    is_working: true,
                    start_time: '09:00',
                    end_time: '12:00',
                  },
                ],
                error: null,
              })
            ),
          })),
        }
      }

      if (table === 'employee_schedule_exceptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
        }
      }

      if (table === 'employee_absences') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({
                  gte: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'time_reservations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                lt: vi.fn(() => ({
                  gt: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'premium_slots') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return supabase
}

describe('public availability equipment timezone hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveApiKeyMock.mockResolvedValue({ salonId: 'salon-1' })
  })

  it('hides blocked local hour when equipment booking is stored in UTC for salon timezone', async () => {
    createAdminSupabaseClientMock.mockReturnValue(createAvailabilitySupabaseMock())

    const request = new NextRequest(
      'http://localhost/api/public/availability?date=2026-05-10&serviceId=123e4567-e89b-42d3-a456-426614174000&employeeId=123e4567-e89b-42d3-a456-426614174100'
    )
    const response = await GET(request)
    expect(response).toBeInstanceOf(NextResponse)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.slots).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30'])
    expect(body.slots).not.toContain('10:00')
  })
})
