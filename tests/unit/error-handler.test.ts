import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { handleApiError } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'

describe('handleApiError', () => {
  it('maps AppError to status code and payload', async () => {
    const response = handleApiError(new NotFoundError('Client', '123'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it('maps Zod error to validation response', async () => {
    const schema = z.object({ name: z.string().min(2) })
    const parsed = schema.safeParse({ name: 'a' })
    if (parsed.success) {
      throw new Error('Expected parse to fail')
    }

    const response = handleApiError(parsed.error)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('maps postgres unique constraint to conflict', async () => {
    const response = handleApiError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (email)=(x@example.com) already exists.',
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('UNIQUE_VIOLATION')
  })
})
