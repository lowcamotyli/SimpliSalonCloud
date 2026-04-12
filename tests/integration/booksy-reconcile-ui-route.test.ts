import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getAuthContextMock, withErrorHandlingMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  withErrorHandlingMock: vi.fn((handler: any) => handler),
}))

vi.mock('@/lib/error-handler', () => ({
  withErrorHandling: withErrorHandlingMock,
}))

vi.mock('@/lib/supabase/get-auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

import { POST } from '@/app/api/integrations/booksy/reconcile/route'

function createDeferredResponse(payload: unknown, status = 200) {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((res) => {
    resolve = res
  })

  return {
    promise,
    resolve: () => resolve(new Response(JSON.stringify(payload), { status })),
  }
}

describe('Booksy integration reconcile route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'

    const rpcMock = vi.fn(async () => ({ data: true, error: null }))
    const maybeSingleMock = vi.fn(async () => ({ data: { id: 'account-1' }, error: null }))
    const eqChain: any = {
      eq: vi.fn(() => eqChain),
      maybeSingle: maybeSingleMock,
    }
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => eqChain),
    }))

    getAuthContextMock.mockResolvedValue({
      salonId: 'salon-1',
      supabase: {
        rpc: rpcMock,
        from: fromMock,
      },
    })
  })

  it('runs reconcile, then parse, then apply in sequence', async () => {
    const reconcile = createDeferredResponse({ ok: 'reconcile' })
    const parse = createDeferredResponse({ ok: 'parse' })
    const apply = createDeferredResponse({ ok: 'apply' })

    const fetchMock = vi.fn()
    fetchMock
      .mockImplementationOnce(() => reconcile.promise)
      .mockImplementationOnce(() => parse.promise)
      .mockImplementationOnce(() => apply.promise)
    vi.stubGlobal('fetch', fetchMock)

    const request = new NextRequest('http://localhost/api/integrations/booksy/reconcile', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'account-1' }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const responsePromise = POST(request)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toContain('/api/internal/booksy/reconcile')

    reconcile.resolve()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchMock.mock.calls[1]?.[0]?.toString()).toContain('/api/internal/booksy/parse')

    parse.resolve()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    expect(fetchMock.mock.calls[2]?.[0]?.toString()).toContain('/api/internal/booksy/apply')

    apply.resolve()

    const response = await responsePromise
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      accountId: 'account-1',
      reconcile: { ok: 'reconcile' },
      parse: { ok: 'parse' },
      apply: { ok: 'apply' },
    })
  })
})
