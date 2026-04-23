import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getAuthContextMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/get-auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

import { GET } from '@/app/api/services/route'

function createServicesSupabaseStub(services: any[]) {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    is: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    then<TResult1 = any, TResult2 = never>(
      onfulfilled?: ((value: { data: any[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve({
        data: services,
        error: null,
      }).then(onfulfilled, onrejected)
    },
  }

  return {
    from: vi.fn((table: string) => {
      if (table !== 'services') {
        throw new Error(`Unexpected table ${table}`)
      }
      return queryBuilder
    }),
  }
}

describe('GET /api/services price_type mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns nested services with normalized price_type for admin UI', async () => {
    const supabase = createServicesSupabaseStub([
      {
        id: 'service-1',
        category: 'Twarz',
        subcategory: 'Peeling',
        name: 'Peeling kawitacyjny',
        price: 150,
        price_type: 'hidden',
        duration: 45,
        description: null,
        surcharge_allowed: true,
        employee_services: [{ count: 2 }],
      },
    ])

    getAuthContextMock.mockResolvedValue({
      supabase,
      salonId: 'salon-1',
    })

    const response = await GET(new NextRequest('http://localhost/api/services'))
    const body = await response.json()

    const service = body.services[0].subcategories[0].services[0]
    expect(response.status).toBe(200)
    expect(service.price_type).toBe('hidden')
    expect(service.assignedEmployeeCount).toBe(2)
  })
})
