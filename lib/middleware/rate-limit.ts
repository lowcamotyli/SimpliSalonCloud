import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Types (kept for backward compat with callers of checkProtectedApiRateLimit /
// checkPublicApiRateLimit that use the returned object)
// ---------------------------------------------------------------------------
interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

// ---------------------------------------------------------------------------
// Upstash Redis path (production)
// ---------------------------------------------------------------------------
let upstashRatelimit: {
  limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>
} | null = null

async function getUpstashLimiter(limit: number): Promise<typeof upstashRatelimit> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  // Lazy import — keeps bundle small; only loaded when env vars present
  const { Ratelimit } = await import('@upstash/ratelimit')
  const { redis } = await import('@/lib/redis')
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, '1 m'),
    analytics: true,
    prefix: 'rl',
  })
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev / CI without Upstash env vars)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, number[]>()
let _devWarnEmitted = false

function devFallback(key: string, limit: number, windowMs: number): RateLimitResult {
  if (!_devWarnEmitted) {
    console.warn('[rate-limit] UPSTASH_REDIS_REST_URL not set, using in-memory fallback (dev only)')
    _devWarnEmitted = true
  }
  const now = Date.now()
  for (const [k, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs)
    if (valid.length === 0) rateLimitMap.delete(k)
    else rateLimitMap.set(k, valid)
  }
  const current = rateLimitMap.get(key) ?? []
  const reset = current.length > 0 ? current[0] + windowMs : now + windowMs
  if (current.length >= limit) {
    return { success: false, limit, remaining: 0, reset }
  }
  rateLimitMap.set(key, [...current, now])
  return { success: true, limit, remaining: limit - current.length - 1, reset }
}

// ---------------------------------------------------------------------------
// Public helpers (used by dedicated callers e.g. crm/quick-send)
// ---------------------------------------------------------------------------

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

  const limiter = await getUpstashLimiter(limit)
  if (limiter) {
    const result = await limiter.limit(key)
    return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset }
  }
  return devFallback(key, limit, windowMs)
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

  const limiter = await getUpstashLimiter(limit)
  if (limiter) {
    const result = await limiter.limit(key)
    return { success: result.success, limit: result.limit, remaining: result.remaining, reset: result.reset }
  }
  return devFallback(key, limit, windowMs)
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

/**
 * Generic rate limit middleware — returns NextResponse 429 if exceeded, null if OK.
 * Default: 60 requests per minute per IP.
 */
export async function applyRateLimit(
  request: NextRequest,
  opts?: { limit?: number; windowMs?: number }
): Promise<NextResponse | null> {
  const limit = opts?.limit ?? 60
  const windowMs = opts?.windowMs ?? 60_000
  const ip = getClientIp(request.headers)

  const limiter = await getUpstashLimiter(limit)

  let result: RateLimitResult
  if (limiter) {
    const r = await limiter.limit(ip)
    result = { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset }
  } else {
    result = devFallback(ip, limit, windowMs)
  }

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
