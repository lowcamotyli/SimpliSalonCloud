import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

import { PUT } from '@/app/api/equipment/[id]/services/route'

type ServiceRow = { id: string }

function createSupabaseStub(options: {
  role?: string
  equipmentExists?: boolean
  validServices?: ServiceRow[]
  rpcError?: { code?: string; message?: string } | null
}) {
  const rpcMock = vi.fn(async () => ({ error: options.rpcError ?? null }))
  const deleteEqMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
  const insertMock = vi.fn(() => Promise.resolve({ data: null, error: null }))

  return {
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-1',
              app_metadata: { role: options.role ?? 'owner' },
            },
          },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { salon_id: 'salon-1', role: options.role ?? 'owner' },
                  error: null,
                }),
              })),
            })),
          }
        }

        if (table === 'equipment') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: options.equipmentExists === false ? null : { id: 'eq-1' },
                    error: null,
                  }),
                })),
              })),
            })),
          }
        }

        if (table === 'services') {
          const rows = options.validServices ?? []
          const builder = {
            eq: vi.fn(() => builder),
            in: vi.fn(() => builder),
            then<TResult1 = any, TResult2 = never>(
              onfulfilled?:
                | ((value: { data: ServiceRow[]; error: null }) => TResult1 | PromiseLike<TResult1>)
                | null,
              onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected)
            },
          }

          return {
            select: vi.fn(() => builder),
          }
        }

        if (table === 'service_equipment') {
          return {
            delete: vi.fn(() => ({
              eq: deleteEqMock,
            })),
            insert: insertMock,
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: rpcMock,
    },
    rpcMock,
    deleteEqMock,
    insertMock,
  }
}

function makePutRequest(serviceIds: string[]) {
  return new NextRequest('http://localhost/api/equipment/eq-1/services', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serviceIds }),
  })
}

describe('PUT /api/equipment/[id]/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects cross-tenant service IDs with explicit 4xx', async () => {
    const { client, rpcMock } = createSupabaseStub({
      validServices: [{ id: 'svc-local-1' }],
    })
    createServerSupabaseClientMock.mockResolvedValue(client)

    const response = await PUT(makePutRequest(['svc-local-1', 'svc-foreign-2']), {
      params: Promise.resolve({ id: 'eq-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(String(body.message)).toContain('serviceIds')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('saves multiple assignments for same-salon services', async () => {
    const { client, rpcMock } = createSupabaseStub({
      validServices: [{ id: 'svc-1' }, { id: 'svc-2' }],
    })
    createServerSupabaseClientMock.mockResolvedValue(client)

    const response = await PUT(makePutRequest(['svc-1', 'svc-2']), {
      params: Promise.resolve({ id: 'eq-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.assignedServicesCount).toBe(2)
    expect(body.serviceIds).toEqual(['svc-1', 'svc-2'])
    expect(rpcMock).toHaveBeenCalledWith('replace_equipment_services', {
      p_equipment_id: 'eq-1',
      p_service_ids: ['svc-1', 'svc-2'],
    })
  })
})

