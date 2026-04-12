import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  createAdminSupabaseClientMock,
  applyParsedEventMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createAdminSupabaseClientMock: vi.fn(),
  applyParsedEventMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

vi.mock('@/lib/booksy/processor', () => ({
  applyParsedEvent: applyParsedEventMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}))

import { POST } from '@/app/api/internal/booksy/apply/route'

type ParsedEventRow = {
  id: string
  salon_id: string
  event_type: string
  confidence_score: number
  status: 'pending' | 'manual_review' | 'discarded'
}

function makeRequest(secret?: string) {
  return new NextRequest('http://localhost/api/internal/booksy/apply', {
    method: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

function createSupabaseStub(events: ParsedEventRow[]) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'booksy_parsed_events') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: string) => {
            if (column !== 'status' || value !== 'pending') {
              throw new Error(`Unexpected filter ${column}=${value}`)
            }

            return {
              limit: vi.fn(async (limitValue: number) => ({
                data: events.filter((event) => event.status === 'pending').slice(0, limitValue),
                error: null,
              })),
            }
          }),
        })),
        update: vi.fn((payload: Partial<ParsedEventRow>) => ({
          eq: vi.fn((idColumn: string, idValue: string) => ({
            eq: vi.fn(async (salonColumn: string, salonValue: string) => {
              const event = events.find((item) => item[idColumn as keyof ParsedEventRow] === idValue)

              if (!event || idColumn !== 'id' || salonColumn !== 'salon_id' || event.salon_id !== salonValue) {
                return { error: { message: 'Parsed event not found' } }
              }

              if (payload.status) {
                event.status = payload.status
              }

              return { error: null }
            }),
          })),
        })),
      }
    }),
  }
}

describe('Booksy apply worker route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  it('rejects unauthorized requests', async () => {
    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('applies high-confidence events and counts deduplicated ones as skipped', async () => {
    const supabase = createSupabaseStub([
      {
        id: 'evt-1',
        salon_id: 'salon-1',
        event_type: 'created',
        confidence_score: 0.9,
        status: 'pending',
      },
      {
        id: 'evt-2',
        salon_id: 'salon-1',
        event_type: 'cancelled',
        confidence_score: 0.95,
        status: 'pending',
      },
    ])
    createAdminSupabaseClientMock.mockReturnValue(supabase)
    applyParsedEventMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, deduplicated: true })

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      applied: 1,
      manual_review: 0,
      discarded: 0,
      skipped: 1,
      failures: [],
    })
    expect(applyParsedEventMock).toHaveBeenCalledTimes(2)
    expect(applyParsedEventMock).toHaveBeenNthCalledWith(1, 'evt-1')
    expect(applyParsedEventMock).toHaveBeenNthCalledWith(2, 'evt-2')
  })

  it('moves medium-confidence events to manual review and low-confidence events to discarded', async () => {
    const events: ParsedEventRow[] = [
      {
        id: 'evt-3',
        salon_id: 'salon-2',
        event_type: 'created',
        confidence_score: 0.7,
        status: 'pending',
      },
      {
        id: 'evt-4',
        salon_id: 'salon-2',
        event_type: 'created',
        confidence_score: 0.4,
        status: 'pending',
      },
    ]
    createAdminSupabaseClientMock.mockReturnValue(createSupabaseStub(events))

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      applied: 0,
      manual_review: 1,
      discarded: 1,
      skipped: 0,
      failures: [],
    })
    expect(events[0].status).toBe('manual_review')
    expect(events[1].status).toBe('discarded')
    expect(applyParsedEventMock).not.toHaveBeenCalled()
  })

  it('reports apply failures without aborting the whole batch', async () => {
    const supabase = createSupabaseStub([
      {
        id: 'evt-5',
        salon_id: 'salon-3',
        event_type: 'created',
        confidence_score: 0.99,
        status: 'pending',
      },
      {
        id: 'evt-6',
        salon_id: 'salon-3',
        event_type: 'created',
        confidence_score: 0.99,
        status: 'pending',
      },
    ])
    createAdminSupabaseClientMock.mockReturnValue(supabase)
    applyParsedEventMock
      .mockRejectedValueOnce(new Error('Service not found'))
      .mockResolvedValueOnce({ success: true })

    const response = await POST(makeRequest(process.env.CRON_SECRET))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      applied: 1,
      manual_review: 0,
      discarded: 0,
      skipped: 0,
      failures: [{ eventId: 'evt-5', error: 'Service not found' }],
    })
    expect(loggerErrorMock).toHaveBeenCalled()
  })
})
