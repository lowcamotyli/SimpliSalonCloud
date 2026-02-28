import { NextRequest, NextResponse } from 'next/server'

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const rateLimitMap = new Map<string, number[]>()

function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Clean up expired entries
  for (const [k, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs)
    if (valid.length === 0) {
      rateLimitMap.delete(k)
    } else {
      rateLimitMap.set(k, valid)
    }
  }

  const current = rateLimitMap.get(key) ?? []
  const reset = current.length > 0 ? current[0] + windowMs : now + windowMs

  if (current.length >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset,
    }
  }

  rateLimitMap.set(key, [...current, now])
  return {
    success: true,
    limit,
    remaining: limit - current.length - 1,
    reset,
  }
}

/**
 * Rate limit for authenticated/protected API routes.
 * Default: 20 requests per minute per key.
 */
export async function checkProtectedApiRateLimit(
  key: string,
  opts?: { limit?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limit = opts?.limit ?? 20
  const windowMs = opts?.windowMs ?? 60_000
  return checkRateLimit(key, limit, windowMs)
}

/**
 * Rate limit for public (unauthenticated) API routes.
 * Default: 10 requests per minute per IP.
 */
export async function checkPublicApiRateLimit(
  key: string,
  opts?: { limit?: number; windowMs?: number }
): Promise<RateLimitResult> {
  const limit = opts?.limit ?? 10
  const windowMs = opts?.windowMs ?? 60_000
  return checkRateLimit(key, limit, windowMs)
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

/**
 * Generic rate limit middleware — returns NextResponse 429 if exceeded, null if OK.
 */
export async function applyRateLimit(
  request: NextRequest,
  opts?: { limit?: number; windowMs?: number }
): Promise<NextResponse | null> {
  const limit = opts?.limit ?? 60
  const windowMs = opts?.windowMs ?? 60_000
  const ip = getClientIp(request.headers)

  const result = checkRateLimit(ip, limit, windowMs)

  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(result.reset / 1000).toString(),
        },
      }
    )
  }

  return null
}
