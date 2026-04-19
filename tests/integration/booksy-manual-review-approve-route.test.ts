import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  withErrorHandlingMock,
  getAuthContextMock,
  createAdminSupabaseClientMock,
  applyParsedEventMock,
} = vi.hoisted(() => ({
  withErrorHandlingMock: vi.fn((handler: unknown) => handler),
  getAuthContextMock: vi.fn(),
  createAdminSupabaseClientMock: vi.fn(),
  applyParsedEventMock: vi.fn(),
}))

vi.mock('@/lib/error-handler', () => ({
  withErrorHandling: withErrorHandlingMock,
}))

vi.mock('@/lib/supabase/get-auth-context', () => ({
  getAuthContext: getAuthContextMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

vi.mock('@/lib/booksy/processor', () => ({
  applyParsedEvent: applyParsedEventMock,
}))

import { POST } from '@/app/api/integrations/booksy/manual-review/[id]/approve/route'

function createSupabaseStub(eventId: string, salonId: string) {
  const maybeSingleMock = vi.fn(async () => ({
    data: { id: eventId, status: 'manual_review', event_fingerprint: 'fingerprint-1' },
    error: null,
  }))
  const eqSalonMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const eqIdMock = vi.fn(() => ({ eq: eqSalonMock }))
  const selectMock = vi.fn(() => ({ eq: eqIdMock }))

  return {
    from: vi.fn(() => ({
      select: selectMock,
    })),
    assertions: {
      maybeSingleMock,
      eqSalonMock,
      eqIdMock,
      selectMock,
      salonId,
    },
  }
}

function createAdminSupabaseStub() {
  const eqOperationMock = vi.fn(async () => ({ error: null }))
  const eqSalonMock = vi.fn(() => ({ eq: eqOperationMock }))
  const eqEventMock = vi.fn(() => ({ eq: eqSalonMock }))
  const updateMock = vi.fn(() => ({ eq: eqEventMock }))

  return {
    from: vi.fn(() => ({
      update: updateMock,
    })),
    assertions: {
      eqOperationMock,
      eqSalonMock,
      eqEventMock,
      updateMock,
    },
  }
}

describe('Booksy manual review approve route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards bookingId override to applyParsedEvent', async () => {
    const eventId = 'evt-123'
    const salonId = 'salon-123'
    const supabase = createSupabaseStub(eventId, salonId)
    const adminSupabase = createAdminSupabaseStub()

    getAuthContextMock.mockResolvedValue({ supabase, salonId })
    createAdminSupabaseClientMock.mockReturnValue(adminSupabase)
    applyParsedEventMock.mockResolvedValue({ success: true, type: 'reschedule' })

    const request = new NextRequest(`http://localhost/api/integrations/booksy/manual-review/${eventId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: ' booking-77 ' }),
    })

    const response = await POST(request, { params: Promise.resolve({ id: eventId }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ success: true, result: { success: true, type: 'reschedule' } })
    expect(applyParsedEventMock).toHaveBeenCalledWith(eventId, { bookingId: 'booking-77' })
  })
})

