import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/**
 * Rate limiters dla różnych typów endpoints
 */

// Public API - 100 requests/minute per IP
const publicApiLimiter = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
      prefix: 'ratelimit:public-api',
    })
  : null

// Login endpoint - 5 attempts/15 minutes per IP
const loginLimiter = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
      prefix: 'ratelimit:login',
    })
  : null

// Protected API - 1000 requests/hour per user
const protectedApiLimiter = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(1000, '1 h'),
      analytics: true,
      prefix: 'ratelimit:protected-api',
    })
  : null

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Sprawdza rate limit dla public API endpoint
 *
 * @param identifier - Zazwyczaj IP address
 * @returns RateLimitResult
 */
export async function checkPublicApiRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  // W development mode lub bez Redis, zawsze zezwalaj
  if (
    process.env.NODE_ENV === 'development' ||
    !process.env.UPSTASH_REDIS_REST_URL ||
    !publicApiLimiter
  ) {
    return { success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }
  }

  const { success, limit, reset, remaining } = await publicApiLimiter.limit(
    `public:${identifier}`
  )

  return { success, limit, remaining, reset }
}

/**
 * Sprawdza rate limit dla login endpoint
 *
 * @param identifier - Zazwyczaj IP address
 * @returns RateLimitResult
 */
export async function checkLoginRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  // W development mode lub bez Redis, zawsze zezwalaj
  if (
    process.env.NODE_ENV === 'development' ||
    !process.env.UPSTASH_REDIS_REST_URL ||
    !loginLimiter
  ) {
    return { success: true, limit: 5, remaining: 4, reset: Date.now() + 900000 }
  }

  const { success, limit, reset, remaining } = await loginLimiter.limit(
    `login:${identifier}`
  )

  return { success, limit, remaining, reset }
}

/**
 * Sprawdza rate limit dla protected API endpoint
 *
 * @param identifier - Zazwyczaj user ID lub salon ID
 * @returns RateLimitResult
 */
export async function checkProtectedApiRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  // W development mode lub bez Redis, zawsze zezwalaj
  if (
    process.env.NODE_ENV === 'development' ||
    !process.env.UPSTASH_REDIS_REST_URL ||
    !protectedApiLimiter
  ) {
    return { success: true, limit: 1000, remaining: 999, reset: Date.now() + 3600000 }
  }

  const { success, limit, reset, remaining } = await protectedApiLimiter.limit(
    `protected:${identifier}`
  )

  return { success, limit, remaining, reset }
}

/**
 * Generyczny helper do sprawdzania rate limit
 *
 * @param identifier - Identifier dla rate limiting
 * @param type - Typ endpoint ('public-api' | 'login' | 'protected-api')
 * @returns RateLimitResult
 */
export async function checkRateLimit(
  identifier: string,
  type: 'public-api' | 'login' | 'protected-api' = 'protected-api'
): Promise<RateLimitResult> {
  switch (type) {
    case 'public-api':
      return checkPublicApiRateLimit(identifier)
    case 'login':
      return checkLoginRateLimit(identifier)
    case 'protected-api':
      return checkProtectedApiRateLimit(identifier)
    default:
      return checkProtectedApiRateLimit(identifier)
  }
}

/**
 * Helper do pobierania IP address z request
 *
 * @param headers - Request headers
 * @returns IP address string
 */
export function getClientIp(headers: Headers): string {
  // Vercel / Next.js automatically adds x-forwarded-for header
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for może zawierać listę IP addresses, pierwszy to client IP
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Fallback
  return 'unknown'
}
