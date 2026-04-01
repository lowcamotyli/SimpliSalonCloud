/**
 * Returns the base app URL, with fallbacks suitable for all environments.
 *
 * Priority:
 * 1. APP_URL (server-side, set explicitly)
 * 2. NEXT_PUBLIC_APP_URL (client+server, set explicitly)
 * 3. NEXT_PUBLIC_SITE_URL (legacy/public site env)
 * 4. VERCEL_BRANCH_URL / VERCEL_URL (current deployment — preview or prod)
 * 5. VERCEL_PROJECT_PRODUCTION_URL (fallback to prod domain)
 * 6. http://localhost:3000 (local dev)
 */
function normalizeCandidateUrl(value: string | undefined): string | null {
  if (!value) return null

  const withProtocol = value.startsWith('http://') || value.startsWith('https://')
    ? value
    : `https://${value}`

  try {
    const url = new URL(withProtocol)

    // Supabase project domains serve DB/auth/storage APIs, not app routes.
    if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
      return null
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getAppUrl(): string {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeCandidateUrl(candidate)
    if (normalized) return normalized
  }

  return 'http://localhost:3000'
}
