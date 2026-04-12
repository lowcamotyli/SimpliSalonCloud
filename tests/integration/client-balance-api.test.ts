import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAuthContextMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/get-auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

import { GET as getBalance } from '@/app/api/clients/[id]/balance/route'
import { POST as depositBalance } from '@/app/api/clients/[id]/balance/deposit/route'
import { POST as debitBalance } from '@/app/api/clients/[id]/balance/debit/route'
import { POST as refundBalance } from '@/app/api/clients/[id]/balance/refund/route'

type SupabaseResponse = { data?: unknown; error?: unknown }

function createQueryBuilder(response: SupabaseResponse, options?: { trackInsert?: (payload: any) => void }) {
  return {
    select: vi.fn(() => createQueryBuilder(response, options)),
    insert: vi.fn((payload: any) => {
      options?.trackInsert?.(payload)
      return createQueryBuilder(response, options)
    }),
    update: vi.fn(() => createQueryBuilder(response, options)),
    delete: vi.fn(() => createQueryBuilder(response, options)),
    eq: vi.fn(() => createQueryBuilder(response, options)),
    is: vi.fn(() => createQueryBuilder(response, options)),
    not: vi.fn(() => createQueryBuilder(response, options)),
    order: vi.fn(() => createQueryBuilder(response, options)),
    limit: vi.fn(async () => ({ data: response.data ?? null, error: response.error ?? null })),
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
  client?: SupabaseResponse
  summary?: SupabaseResponse
  transactions?: SupabaseResponse
  employee?: SupabaseResponse
  insertResult?: SupabaseResponse
  onInsert?: (payload: any) => void
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'clients') {
        return createQueryBuilder(config.client ?? { data: { id: 'client-1' }, error: null })
      }

      if (table === 'client_balance_summary') {
        return createQueryBuilder(config.summary ?? { data: { balance: 0 }, error: null })
      }

      if (table === 'client_balance_transactions') {
        return createQueryBuilder(
          config.transactions ?? { data: [{ sum: 0 }], error: null },
          { trackInsert: config.onInsert }
        )
      }

      if (table === 'employees') {
        return createQueryBuilder(config.employee ?? { data: { id: 'employee-1' }, error: null })
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe('client balance API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns balance summary with recent transactions', async () => {
    const supabase = createSupabaseStub({
      client: { data: { id: 'client-1' }, error: null },
      summary: { data: { balance: 125 }, error: null },
      transactions: {
        data: [
          {
            id: 'txn-1',
            amount: 125,
            type: 'deposit',
            booking_id: null,
            description: 'Pakiet startowy',
            created_at: '2026-04-09T10:00:00.000Z',
            created_by: 'user-1',
          },
        ],
        error: null,
      },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      user: { id: 'user-1' },
      salonId: 'salon-1',
    })

    const response = await getBalance(new Request('http://localhost/api/clients/client-1/balance'), {
      params: Promise.resolve({ id: 'client-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      balance: 125,
      transactions: [
        {
          id: 'txn-1',
          amount: 125,
          type: 'deposit',
          booking_id: null,
          description: 'Pakiet startowy',
          created_at: '2026-04-09T10:00:00.000Z',
          created_by: 'user-1',
        },
      ],
    })
  })

  it('creates a deposit transaction and returns recalculated balance', async () => {
    let insertedPayload: any = null
    const supabase = createSupabaseStub({
      client: { data: { id: 'client-1' }, error: null },
      summary: { data: { balance: 175 }, error: null },
      transactions: { data: [{ sum: '175' }], error: null },
      onInsert: (payload) => {
        insertedPayload = payload
      },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      user: { id: 'user-42' },
      salonId: 'salon-1',
    })

    const response = await depositBalance(
      new Request('http://localhost/api/clients/client-1/balance/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 175, description: 'Doładowanie' }),
      }),
      { params: Promise.resolve({ id: 'client-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, new_balance: 175 })
    expect(insertedPayload).toEqual({
      salon_id: 'salon-1',
      client_id: 'client-1',
      type: 'deposit',
      amount: 175,
      description: 'Doładowanie',
      created_by: 'employee-1',
    })
  })

  it('blocks debit when current balance is insufficient', async () => {
    const supabase = createSupabaseStub({
      client: { data: { id: 'client-1' }, error: null },
      transactions: { data: [{ sum: 40 }], error: null },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      user: { id: 'user-42' },
      salonId: 'salon-1',
    })

    const response = await debitBalance(
      new Request('http://localhost/api/clients/client-1/balance/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 50, description: 'Rozliczenie wizyty' }),
      }),
      { params: Promise.resolve({ id: 'client-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Insufficient balance' })
  })

  it('creates refund transaction and returns updated balance', async () => {
    let insertedPayload: any = null
    const supabase = createSupabaseStub({
      client: { data: { id: 'client-1' }, error: null },
      summary: { data: { balance: 80 }, error: null },
      transactions: { data: [{ sum: 80 }], error: null },
      onInsert: (payload) => {
        insertedPayload = payload
      },
    })

    getAuthContextMock.mockResolvedValue({
      supabase,
      user: { id: 'user-7' },
      salonId: 'salon-1',
    })

    const response = await refundBalance(
      new Request('http://localhost/api/clients/client-1/balance/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 30, description: 'Zwrot nadpłaty' }),
      }),
      { params: Promise.resolve({ id: 'client-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, new_balance: 80 })
    expect(insertedPayload).toEqual({
      salon_id: 'salon-1',
      client_id: 'client-1',
      type: 'refund',
      amount: 30,
      description: 'Zwrot nadpłaty',
      created_by: 'employee-1',
    })
  })
})
