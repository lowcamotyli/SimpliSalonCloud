import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

import { GET } from '@/app/api/forms/templates/route'

function createSupabaseClient(role: 'employee' | 'owner' | 'manager') {
  const templates = [
    { id: 'template-general', name: 'General Intake', data_category: 'general' },
    {
      id: 'template-sensitive',
      name: 'Medical Intake',
      data_category: 'sensitive_health',
    },
  ]

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            app_metadata: { role },
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
                data: { salon_id: 'salon-1' },
              }),
            })),
          })),
        }
      }

      if (table === 'form_templates') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: templates,
                  error: null,
                }),
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe('forms templates data category filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not return sensitive_health templates for employee role', async () => {
    createServerSupabaseClientMock.mockResolvedValue(createSupabaseClient('employee'))

    const response = await GET(new Request('http://localhost/api/forms/templates'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.templates).toEqual([
      { id: 'template-general', name: 'General Intake', data_category: 'general' },
    ])
  })

  it('returns all templates including sensitive_health for owner role', async () => {
    createServerSupabaseClientMock.mockResolvedValue(createSupabaseClient('owner'))

    const response = await GET(new Request('http://localhost/api/forms/templates'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.templates).toHaveLength(2)
    expect(body.templates.map((template: { data_category: string }) => template.data_category)).toContain(
      'sensitive_health'
    )
  })

  it('returns all templates including sensitive_health for manager role', async () => {
    createServerSupabaseClientMock.mockResolvedValue(createSupabaseClient('manager'))

    const response = await GET(new Request('http://localhost/api/forms/templates'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.templates).toHaveLength(2)
    expect(body.templates.map((template: { data_category: string }) => template.data_category)).toContain(
      'sensitive_health'
    )
  })
})
