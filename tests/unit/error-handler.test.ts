import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { handleApiError } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'

test('handleApiError maps AppError to status code and payload', async () => {
    const response = handleApiError(new NotFoundError('Client', '123'))
    const body = await response.json()

    assert.equal(response.status, 404)
    assert.equal(body.code, 'NOT_FOUND')
})

test('handleApiError maps Zod error to validation response', async () => {
    const schema = z.object({ name: z.string().min(2) })
    const parsed = schema.safeParse({ name: 'a' })
    if (parsed.success) {
      throw new Error('Expected parse to fail')
    }

    const response = handleApiError(parsed.error)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.code, 'VALIDATION_ERROR')
})

test('handleApiError maps postgres unique constraint to conflict', async () => {
    const response = handleApiError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (email)=(x@example.com) already exists.',
    })
    const body = await response.json()

    assert.equal(response.status, 409)
    assert.equal(body.code, 'UNIQUE_VIOLATION')
})

