import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  verifyFormTokenMock,
  encryptAnswersMock,
  createAdminSupabaseClientMock,
} = vi.hoisted(() => ({
  verifyFormTokenMock: vi.fn(),
  encryptAnswersMock: vi.fn(),
  createAdminSupabaseClientMock: vi.fn(),
}))

vi.mock('@/lib/forms/token', () => ({
  verifyFormToken: verifyFormTokenMock,
}))

vi.mock('@/lib/forms/encryption', () => ({
  encryptAnswers: encryptAnswersMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

import { POST } from '@/app/api/forms/submit/[token]/route'

function createAdminClient(templateDataCategory: 'health' | 'general') {
  const updateEqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn(() => ({
    eq: updateEqMock,
  }))

  const clientFormsSelectQuery = {
    eq: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'client-form-1',
            fill_token_exp: null,
            form_template_id: 'template-1',
          },
          error: null,
        }),
      })),
    })),
  }

  const formTemplatesSelectQuery = {
    eq: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            fields: [],
            data_category: templateDataCategory,
          },
          error: null,
        }),
      })),
    })),
  }

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'client_forms') {
          return {
            select: vi.fn(() => clientFormsSelectQuery),
            update: updateMock,
          }
        }

        if (table === 'form_templates') {
          return {
            select: vi.fn(() => formTemplatesSelectQuery),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
      storage: {
        from: vi.fn(),
      },
    },
    updateMock,
    updateEqMock,
  }
}

describe('forms submit consent gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    verifyFormTokenMock.mockResolvedValue({
      salonId: 'salon-1',
      clientId: 'client-1',
    })

    encryptAnswersMock.mockReturnValue({
      encrypted: Buffer.from('encrypted'),
      iv: Buffer.from('iv'),
      tag: Buffer.from('tag'),
    })
  })

  it('returns 422 for health data when health_consent is missing', async () => {
    const { client, updateMock } = createAdminClient('health')
    createAdminSupabaseClientMock.mockReturnValue(client)

    const request = new Request('http://localhost/api/forms/submit/token-1', {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          symptom: 'pain',
        },
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await POST(request, {
      params: Promise.resolve({ token: 'token-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('zgoda')
    expect(encryptAnswersMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 200 for health data when health_consent is true', async () => {
    const { client, updateEqMock } = createAdminClient('health')
    createAdminSupabaseClientMock.mockReturnValue(client)

    const request = new Request('http://localhost/api/forms/submit/token-1', {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          symptom: 'pain',
          health_consent: true,
        },
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await POST(request, {
      params: Promise.resolve({ token: 'token-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(encryptAnswersMock).toHaveBeenCalledWith({
      symptom: 'pain',
      health_consent: true,
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'client-form-1')
  })

  it('returns 200 for general data without requiring consent', async () => {
    const { client, updateEqMock } = createAdminClient('general')
    createAdminSupabaseClientMock.mockReturnValue(client)

    const request = new Request('http://localhost/api/forms/submit/token-1', {
      method: 'POST',
      body: JSON.stringify({
        answers: {
          first_name: 'Ada',
        },
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await POST(request, {
      params: Promise.resolve({ token: 'token-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(encryptAnswersMock).toHaveBeenCalledWith({
      first_name: 'Ada',
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'client-form-1')
  })
})
