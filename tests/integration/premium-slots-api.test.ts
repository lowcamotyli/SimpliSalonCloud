import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getAuthContextMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/get-auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

import { GET, POST } from '@/app/api/premium-slots/route'
import { DELETE, PATCH } from '@/app/api/premium-slots/[id]/route'

type SupabaseResponse = { data?: unknown; error?: unknown }

function createQueryBuilder(response: SupabaseResponse, options?: { trackInsert?: (payload: any) => void; trackUpdate?: (payload: any) => void }) {
  return {
    select: vi.fn(() => createQueryBuilder(response, options)),
    insert: vi.fn((payload: any) => {
      options?.trackInsert?.(payload)
      return createQueryBuilder(response, options)
    }),
    update: vi.fn((payload: any) => {
      options?.trackUpdate?.(payload)
      return createQueryBuilder(response, options)
    }),
    delete: vi.fn(() => createQueryBuilder(response, options)),
    eq: vi.fn(() => createQueryBuilder(response, options)),
    order: vi.fn(() => createQueryBuilder(response, options)),
    maybeSingle: vi.fn(async () => ({ data: response.data ?? null, error: response.error ?? null })),
    single: vi.fn(async () => ({ data: response.data ?? null, error: response.error ?? null })),
    then<TResult1 = any, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve({
        data: response.data ?? null,
        error: response.error ?? null,
      }).then(onfulfilled, onrejected)
    },
  }
}

function createSupabaseStub(config: {
  list?: SupabaseResponse
  insert?: SupabaseResponse
  existing?: SupabaseResponse
  update?: SupabaseResponse
  remove?: SupabaseResponse
  onInsert?: (payload: any) => void
  onUpdate?: (payload: any) => void
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'premium_slots') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        ...createQueryBuilder(config.list ?? { data: [], error: null }),
        select: vi.fn(() => createQueryBuilder(config.list ?? { data: [], error: null })),
        insert: vi.fn((payload: any) => {
          config.onInsert?.(payload)
          return createQueryBuilder(config.insert ?? { data: payload, error: null })
        }),
        update: vi.fn((payload: any) => {
          config.onUpdate?.(payload)
          return createQueryBuilder(config.update ?? { data: payload, error: null })
        }),
        delete: vi.fn(() => createQueryBuilder(config.remove ?? { data: { id: 'slot-1' }, error: null })),
      }
    }),
  }
}

describe('premium slots API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists premium slots for the current salon', async () => {
    const supabase = createSupabaseStub({
      list: {
        data: [
          {
            id: 'slot-1',
            salon_id: 'salon-1',
            name: 'Happy Hours',
            date: '2026-04-10',
            start_time: '08:00',
            end_time: '10:00',
          },
        ],
        error: null,
      },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      salonId: 'salon-1',
      user: { id: 'user-1' },
    })

    const response = await GET(new NextRequest('http://localhost/api/premium-slots'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.slots).toHaveLength(1)
    expect(body.slots[0].name).toBe('Happy Hours')
  })

  it('creates a premium slot with salon_id from auth context', async () => {
    let insertedPayload: any = null
    const supabase = createSupabaseStub({
      insert: {
        data: {
          id: 'slot-1',
          salon_id: 'salon-1',
          name: 'VIP Morning',
          date: '2026-04-10',
          start_time: '08:00',
          end_time: '10:00',
          requires_prepayment: true,
        },
        error: null,
      },
      onInsert: (payload) => {
        insertedPayload = payload
      },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      salonId: 'salon-1',
      user: { id: 'user-1' },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/premium-slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'VIP Morning',
          date: '2026-04-10',
          start_time: '08:00',
          end_time: '10:00',
          requires_prepayment: true,
          segment_criteria: { tags: ['VIP'] },
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.slot.name).toBe('VIP Morning')
    expect(insertedPayload).toMatchObject({
      salon_id: 'salon-1',
      name: 'VIP Morning',
      requires_prepayment: true,
      segment_criteria: { tags: ['VIP'] },
    })
  })

  it('returns existing slot on empty patch payload', async () => {
    const supabase = createSupabaseStub({
      list: { data: { id: 'slot-1', name: 'Lunch Rush' }, error: null },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      salonId: 'salon-1',
      user: { id: 'user-1' },
    })

    const response = await PATCH(
      new NextRequest('http://localhost/api/premium-slots/slot-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'slot-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ slot: { id: 'slot-1', name: 'Lunch Rush' } })
  })

  it('returns 404 when deleting a missing slot', async () => {
    const supabase = createSupabaseStub({
      remove: { data: null, error: null },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      salonId: 'salon-1',
      user: { id: 'user-1' },
    })

    const response = await DELETE(
      new NextRequest('http://localhost/api/premium-slots/slot-missing', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'slot-missing' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })
})
