import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { handleCorsPreflightRequest, setCorsHeaders } from '@/lib/middleware/cors'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Handle CORS for public API
  if (pathname.startsWith('/api/public/')) {
    // Handle OPTIONS preflight request
    const preflightResponse = handleCorsPreflightRequest(request)
    if (preflightResponse) {
      return preflightResponse
    }

    // For actual requests, add CORS headers and continue
    const response = NextResponse.next()
    return setCorsHeaders(request, response)
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Add security headers (tylko w production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    )
  }

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

  const resolveSalonSlug = async (): Promise<string> => {
    const fromAppMetadata = (user?.app_metadata as { salon_slug?: string } | undefined)?.salon_slug
    if (fromAppMetadata) {
      return fromAppMetadata
    }

    const fromUserMetadata = (user?.user_metadata as { salon_slug?: string } | undefined)?.salon_slug
    if (fromUserMetadata) {
      return fromUserMetadata
    }

    if (!user) {
      return 'dashboard'
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('salons!profiles_salon_id_fkey(slug)')
      .eq('user_id', user.id)
      .maybeSingle()

    const profileWithSalon = profile as { salons?: { slug?: string } | null } | null
    return profileWithSalon?.salons?.slug || 'dashboard'
  }

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
    const slug = await resolveSalonSlug();
    const url = request.nextUrl.clone();
    url.pathname = `/${slug}/dashboard`;
    return NextResponse.redirect(url);
  }

  return response
}

export const config = {
  matcher: [
    '/api/public/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}

