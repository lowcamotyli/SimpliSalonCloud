import { NextRequest, NextResponse } from 'next/server'

/**
 * Konfiguruje CORS headers dla requests bazując na ALLOWED_ORIGINS environment variable.
 * Dozwolone origins definiowane wyłącznie przez ALLOWED_ORIGINS — nigdy przez NODE_ENV.
 * W development ustaw ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173 w .env.local
 *
 * @param request - Incoming NextRequest
 * @param response - NextResponse do modyfikacji
 * @returns NextResponse z ustawionymi CORS headers
 */
export function setCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
  const origin = request.headers.get('origin')

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Salon-Id, Authorization')
  }

  return response
}

/**
 * Obsługuje CORS preflight requests (OPTIONS)
 *
 * @param request - Incoming NextRequest
 * @returns NextResponse dla OPTIONS request
 */
export function handleCorsPreflightRequest(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
  const origin = request.headers.get('origin')

  if (!origin || !allowedOrigins.includes(origin)) {
    return new NextResponse(null, { status: 403 })
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Salon-Id, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  })
}
