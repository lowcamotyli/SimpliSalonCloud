import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { handlePatchEmployee } from '@/app/api/employees/[id]/route'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'

type AnyObj = Record<string, any>

function makePatchRequest(body: AnyObj) {
  return new NextRequest('http://localhost:3000/api/employees/employee-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createDeps(options?: {
  user?: AnyObj | null
  rpcError?: { message?: string } | null
  rpcData?: AnyObj
}) {
  const user = options?.user ?? {
    id: 'user-1',
    app_metadata: {
      role: RBAC_ROLES.EMPLOYEE,
      salon_id: 'salon-1',
    },
  }

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'auth error' },
      }),
    },
    rpc: async () => ({
      data: options?.rpcData ?? { employee_id: 'employee-1', user_id: 'auth-user-1' },
      error: options?.rpcError ?? null,
    }),
  }

  return {
    createSupabase: async () => supabase as any,
    createAdminSupabase: () => ({}) as any,
  }
}

describe('employee link API', () => {
  it('link branch is not blocked by JWT role gate', async () => {
    const response = await handlePatchEmployee(
      makePatchRequest({ email: 'employee@example.com' }),
      { params: Promise.resolve({ id: 'employee-1' }) },
      createDeps({
        user: {
          id: 'user-1',
          app_metadata: {
            role: RBAC_ROLES.EMPLOYEE,
            salon_id: 'salon-1',
          },
        },
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.success).toBe(true)
  })

  it('link branch returns generic non-enumerating error for missing auth account', async () => {
    const response = await handlePatchEmployee(
      makePatchRequest({ email: 'missing@example.com' }),
      { params: Promise.resolve({ id: 'employee-1' }) },
      createDeps({
        rpcError: { message: 'User with this email not found' },
      })
    )

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toBe('Unable to link user account')
  })

  it('link branch returns generic non-enumerating error for permission failures', async () => {
    const response = await handlePatchEmployee(
      makePatchRequest({ email: 'employee@example.com' }),
      { params: Promise.resolve({ id: 'employee-1' }) },
      createDeps({
        rpcError: { message: 'Forbidden' },
      })
    )

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error).toBe('Unable to link user account')
  })

  it('role-change branch keeps strict JWT role gate', async () => {
    const response = await handlePatchEmployee(
      makePatchRequest({ role: RBAC_ROLES.MANAGER }),
      { params: Promise.resolve({ id: 'employee-1' }) },
      createDeps({
        user: {
          id: 'user-1',
          app_metadata: {
            role: RBAC_ROLES.EMPLOYEE,
            salon_id: 'salon-1',
          },
        },
      })
    )

    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error).toBe('Forbidden. Requires OWNER or MANAGER role.')
  })
})
