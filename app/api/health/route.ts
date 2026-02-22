import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

interface HealthCheck {
  status: 'ok' | 'error'
  message?: string
  responseTime?: number
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  version: string
  checks: {
    database: HealthCheck
    redis?: HealthCheck
  }
  uptime: number
}

/**
 * Sprawdza połączenie z bazą danych Supabase
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now()

  try {
    const supabase = createAdminSupabaseClient()

    // Proste query dla sprawdzenia połączenia
    const { error } = await supabase
      .from('salons')
      .select('id')
      .limit(1)
      .single()

    const responseTime = Date.now() - start

    // Error może być "PGRST116" (no rows) - to jest OK dla health check
    if (error && !error.message.includes('PGRST116')) {
      console.error('[HEALTH_CHECK] Database error:', error)
      return {
        status: 'error',
        message: error.message,
        responseTime,
      }
    }

    return {
      status: 'ok',
      responseTime,
    }
  } catch (error) {
    console.error('[HEALTH_CHECK] Database exception:', error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - start,
    }
  }
}

/**
 * Sprawdza połączenie z Redis (Upstash)
 * Opcjonalne - jeśli Redis nie jest skonfigurowany, zwraca null
 */
async function checkRedis(): Promise<HealthCheck | null> {
  // Jeśli Redis nie jest skonfigurowany, skip check
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return null
  }

  const start = Date.now()

  try {
    const { Redis } = await import('@upstash/redis')
    const redis = Redis.fromEnv()

    // Prosty ping
    const pong = await redis.ping()
    const responseTime = Date.now() - start

    if (pong !== 'PONG') {
      return {
        status: 'error',
        message: 'Redis ping failed',
        responseTime,
      }
    }

    return {
      status: 'ok',
      responseTime,
    }
  } catch (error) {
    console.error('[HEALTH_CHECK] Redis error:', error)
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - start,
    }
  }
}

/**
 * Health check endpoint
 * GET /api/health
 *
 * Returns:
 * - 200: All systems operational
 * - 503: Critical system failure (database down)
 * - 200 with degraded status: Non-critical system issues (e.g., Redis down)
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Run checks in parallel
    const [databaseCheck, redisCheck] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ])

    // Określ overall status
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy'

    // Database down = unhealthy (critical)
    if (databaseCheck.status === 'error') {
      status = 'unhealthy'
    }
    // Redis down = degraded (non-critical, app działa bez rate limiting)
    else if (redisCheck && redisCheck.status === 'error') {
      status = 'degraded'
    }

    const response: HealthCheckResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks: {
        database: databaseCheck,
        ...(redisCheck && { redis: redisCheck }),
      },
      uptime: process.uptime(),
    }

    const statusCode = status === 'unhealthy' ? 503 : 200

    console.log('[HEALTH_CHECK] Completed', {
      status,
      duration: Date.now() - startTime,
      statusCode,
    })

    return NextResponse.json(response, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[HEALTH_CHECK] Unexpected error:', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }
}
