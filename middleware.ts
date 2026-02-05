import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  console.log('[MIDDLEWARE] Request:', request.method, request.nextUrl.pathname)
  const pathname = request.nextUrl.pathname

  // Handle CORS for public API
  if (pathname.startsWith('/api/public/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:5173',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Salon-Id',
        },
      })
    }

    // For actual requests, add CORS headers and continue
    const response = NextResponse.next()
    response.headers.set('Access-Control-Allow-Origin', 'http://localhost:5173')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Salon-Id')
    return response
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userPermissions = (user?.app_metadata as { permissions?: string[] })?.permissions || [];

  // Funkcja pomocnicza do sprawdzania uprawnień
  const hasPermission = (requiredPermission: string): boolean => {
    if (userPermissions.includes('*')) return true;
    return userPermissions.includes(requiredPermission);
  };

  // Mapowanie ścieżek do wymaganych uprawnień
  const PATH_PERMISSIONS: { regex: RegExp; permission: string }[] = [
    // /dashboard/[slug]/settings/*
    { regex: /\/settings\//, permission: 'settings:manage' },
    // /dashboard/[slug]/payroll
    { regex: /\/payroll(\/|$)/, permission: 'finance:view' },
    // /dashboard/[slug]/employees
    { regex: /\/employees(\/|$)/, permission: 'employees:manage' },
  ];

  // 1. Walidacja uwierzytelnienia (Niezalogowany użytkownik na chronionej trasie)
  const isDashboardRoute = pathname.match(/^\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+/);

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Walidacja autoryzacji (Zalogowany użytkownik bez uprawnień)
  if (user) {
    const requiredPath = PATH_PERMISSIONS.find(map => pathname.match(map.regex));

    if (requiredPath && !hasPermission(requiredPath.permission)) {
      const parts = pathname.split('/').filter(p => p.length > 0);
      const slug = parts[0] || 'dashboard';

      const url = request.nextUrl.clone();
      url.pathname = `/${slug}/dashboard`;
      return NextResponse.redirect(url);
    }
  }

  // 3. Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const parts = pathname.split('/').filter(p => p.length > 0);
    const slug = parts[0] || 'dashboard';
    const url = request.nextUrl.clone();
    url.pathname = `/${slug}/dashboard`;
    return NextResponse.redirect(url);
  }

  return response
}

export const config = {
  matcher: [
    '/api/public/:path*',
    '/:path*',
  ],
}

