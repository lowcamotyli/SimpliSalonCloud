import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest, NextResponse } from 'next/server'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

const originalNodeEnv = process.env.NODE_ENV
const originalAllowedOrigins = process.env.ALLOWED_ORIGINS

test.beforeEach(() => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    process.env.ALLOWED_ORIGINS = 'https://example.com'
})

test.afterEach(() => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv
    process.env.ALLOWED_ORIGINS = originalAllowedOrigins
})

test('sets CORS headers for allowed origin', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      headers: {
        origin: 'http://localhost:3000',
      },
    })
    const response = NextResponse.next()

    const result = setCorsHeaders(request, response)

    assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
    assert.equal(result.headers.get('Access-Control-Allow-Credentials'), 'true')
})

test('returns 200 for valid preflight request', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
      },
    })

    const result = handleCorsPreflightRequest(request)

    assert.equal(result?.status, 200)
    assert.equal(result?.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
})

