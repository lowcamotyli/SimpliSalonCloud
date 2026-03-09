import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

const originalAllowedOrigins = process.env.ALLOWED_ORIGINS

beforeEach(() => {
  process.env.ALLOWED_ORIGINS = 'https://example.com,http://localhost:3000'
})

afterEach(() => {
  process.env.ALLOWED_ORIGINS = originalAllowedOrigins
})

describe('CORS middleware', () => {
  it('sets CORS headers for allowed origin', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      headers: {
        origin: 'http://localhost:3000',
      },
    })
    const response = NextResponse.next()

    const result = setCorsHeaders(request, response)

    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
    expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('does not set CORS headers for disallowed origin', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      headers: {
        origin: 'https://evil.com',
      },
    })
    const response = NextResponse.next()

    const result = setCorsHeaders(request, response)

    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('returns 200 for valid preflight request from allowed origin', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
      },
    })

    const result = handleCorsPreflightRequest(request)

    expect(result?.status).toBe(200)
    expect(result?.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
  })

  it('returns 403 for preflight from disallowed origin', () => {
    const request = new NextRequest('http://localhost:3000/api/public/bookings', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.com',
      },
    })

    const result = handleCorsPreflightRequest(request)

    expect(result?.status).toBe(403)
  })
})
