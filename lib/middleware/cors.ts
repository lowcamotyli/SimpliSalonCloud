import { NextRequest, NextResponse } from 'next/server'

/**
 * Konfiguruje CORS headers dla requests bazując na ALLOWED_ORIGINS environment variable
 *
 * @param request - Incoming NextRequest
 * @param response - NextResponse do modyfikacji
 * @returns NextResponse z ustawionymi CORS headers
 */
export function setCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
  const origin = request.headers.get('origin')

  // Tylko w development mode zezwalaj na localhost
  if (process.env.NODE_ENV === 'development') {
    const devOrigins = ['http://localhost:5173', 'http://localhost:3000']
    allowedOrigins.push(...devOrigins)
  }

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

  // Development mode
  if (process.env.NODE_ENV === 'development') {
    const devOrigins = ['http://localhost:5173', 'http://localhost:3000']
    allowedOrigins.push(...devOrigins)
  }

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
