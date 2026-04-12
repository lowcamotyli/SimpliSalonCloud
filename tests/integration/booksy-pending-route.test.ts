import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  createServerSupabaseClientMock,
  hasSupabaseSessionCookieMock,
  withErrorHandlingMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  hasSupabaseSessionCookieMock: vi.fn(),
  withErrorHandlingMock: vi.fn((handler: any) => handler),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
  hasSupabaseSessionCookie: hasSupabaseSessionCookieMock,
}))

vi.mock('@/lib/error-handler', () => ({
  withErrorHandling: withErrorHandlingMock,
}))

import { GET } from '@/app/api/integrations/booksy/pending/route'

function createSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { salon_id: 'salon-1' },
                error: null,
              }),
            })),
          })),
        }
      }

      if (table === 'booksy_pending_emails') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'pending-1',
                        message_id: 'msg-1',
                        subject: 'Legacy pending row',
                        body_snippet: 'snippet',
                        parsed_data: { clientName: 'Anna', bookingDate: '2026-04-10', bookingTime: '10:00' },
                        failure_reason: 'service_not_found',
                        failure_detail: 'Missing service',
                        status: 'pending',
                        created_at: '2026-04-10T10:00:00.000Z',
                      },
                    ],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'booksy_parsed_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'event-1',
                        created_at: '2026-04-10T11:00:00.000Z',
                        event_type: 'created',
                        confidence_score: 0.8,
                        payload: {
                          parsed: {
                            clientName: 'Tomasz Rogala',
                            clientPhone: '691571398',
                            clientEmail: 'tomasz.rogala@ymail.com',
                            serviceName: 'Strzyzenie meskie wlosy krotkie',
                            bookingDate: '2025-09-01',
                            bookingTime: '14:00',
                          },
                          raw: {
                            subject: 'Tomasz Rogala: nowa rezerwacja',
                            storagePath: 'bucket/mail.eml',
                          },
                        },
                      },
                    ],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'booksy_apply_ledger') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        booksy_parsed_event_id: 'event-1',
                        error_message: 'Service not found: Strzyzenie meskie wlosy krotkie',
                        applied_at: '2026-04-10T11:01:00.000Z',
                      },
                    ],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe('Booksy pending route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasSupabaseSessionCookieMock.mockResolvedValue(true)
    createServerSupabaseClientMock.mockResolvedValue(createSupabaseClient())
  })

  it('includes manual_review parsed events in the pending queue response', async () => {
    const response = await GET(new NextRequest('http://localhost/api/integrations/booksy/pending?status=pending'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.count).toBe(2)
    expect(body.pending).toHaveLength(2)
    expect(body.pending[0]).toMatchObject({
      id: 'event-1',
      source: 'manual_review',
      subject: 'Tomasz Rogala: nowa rezerwacja',
      failure_reason: 'service_not_found',
      failure_detail: 'Service not found: Strzyzenie meskie wlosy krotkie',
      parsed_data: {
        clientName: 'Tomasz Rogala',
        clientEmail: 'tomasz.rogala@ymail.com',
        serviceName: 'Strzyzenie meskie wlosy krotkie',
      },
      status: 'pending',
    })
    expect(body.pending[1]).toMatchObject({
      id: 'pending-1',
      source: 'pending_email',
      failure_reason: 'service_not_found',
    })
  })
})
