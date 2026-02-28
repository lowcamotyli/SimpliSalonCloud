import { NextRequest, NextResponse } from 'next/server'

const rateLimitMap = new Map<string, number[]>()

export async function applyRateLimit(
  request: NextRequest,
  opts?: { limit?: number; windowMs?: number }
): Promise<NextResponse | null> {
  const limit = opts?.limit ?? 60
  const windowMs = opts?.windowMs ?? 60_000
  const now = Date.now()

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  for (const [key, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs)
    if (valid.length === 0) {
      rateLimitMap.delete(key)
    } else {
      rateLimitMap.set(key, valid)
    }
  }

  const current = rateLimitMap.get(ip) ?? []

  if (current.length >= limit) {
    const resetAt = current[0] + windowMs
    const retryAfter = Math.ceil((resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
        },
      }
    )
  }

  rateLimitMap.set(ip, [...current, now])
  return null
}
