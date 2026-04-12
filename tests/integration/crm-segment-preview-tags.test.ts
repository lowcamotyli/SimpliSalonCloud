import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  createServerSupabaseClientMock,
  checkFeatureAccessMock,
  countSegmentRecipientsMock,
  listSegmentRecipientsMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  checkFeatureAccessMock: vi.fn(),
  countSegmentRecipientsMock: vi.fn(),
  listSegmentRecipientsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/middleware/feature-gate', () => ({
  checkFeatureAccess: checkFeatureAccessMock,
}))

vi.mock('@/lib/messaging/campaign-processor', () => ({
  countSegmentRecipients: countSegmentRecipientsMock,
  listSegmentRecipients: listSegmentRecipientsMock,
}))

import { POST } from '@/app/api/crm/segments/preview/route'

function createSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { salon_id: '123e4567-e89b-42d3-a456-426614174000' },
              error: null,
            }),
          })),
        })),
      })),
    })),
  }
}

describe('CRM segment preview tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createServerSupabaseClientMock.mockResolvedValue(createSupabaseClient())
    checkFeatureAccessMock.mockResolvedValue({ allowed: true })
  })

  it('merges tag criteria into filters before previewing recipients', async () => {
    countSegmentRecipientsMock.mockResolvedValue(2)
    listSegmentRecipientsMock.mockResolvedValue([
      {
        id: 'client-1',
        full_name: 'Anna Kowalska',
        email: 'anna@example.com',
        phone: '+48123456789',
        visit_count: 4,
        total_spent: 520,
        last_visit_at: '2026-04-01T10:00:00.000Z',
        email_opt_in: true,
        sms_opt_in: false,
      },
    ])

    const salonId = '123e4567-e89b-42d3-a456-426614174000'
    const response = await POST(
      new NextRequest('http://localhost/api/crm/segments/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId,
          filters: {
            tags: ['Powracający'],
            criteria: [
              { field: 'tags', operator: 'contains', values: ['VIP', 'Powracający'] },
            ],
          },
          sampleSize: 1,
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(countSegmentRecipientsMock).toHaveBeenCalledWith(salonId, {
      tags: ['Powracający', 'VIP'],
      criteria: [{ field: 'tags', operator: 'contains', values: ['VIP', 'Powracający'] }],
    })
    expect(listSegmentRecipientsMock).toHaveBeenCalledWith(salonId, {
      tags: ['Powracający', 'VIP'],
      criteria: [{ field: 'tags', operator: 'contains', values: ['VIP', 'Powracający'] }],
    }, 1)
    expect(body).toEqual({
      count: 2,
      sample: [
        {
          id: 'client-1',
          fullName: 'Anna Kowalska',
          email: 'anna@example.com',
          phone: '+48123456789',
          visitCount: 4,
          totalSpent: 520,
          lastVisitAt: '2026-04-01T10:00:00.000Z',
          emailOptIn: true,
          smsOptIn: false,
        },
      ],
    })
  })

  it('returns 403 when CRM campaigns feature is unavailable', async () => {
    checkFeatureAccessMock.mockResolvedValue({
      allowed: false,
      reason: 'CRM campaigns are not available',
      upgradeUrl: '/upgrade',
    })

    const response = await POST(
      new NextRequest('http://localhost/api/crm/segments/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          salonId: '123e4567-e89b-42d3-a456-426614174000',
          filters: {},
          sampleSize: 0,
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      error: 'CRM campaigns are not available',
      upgradeUrl: '/upgrade',
    })
  })
})
