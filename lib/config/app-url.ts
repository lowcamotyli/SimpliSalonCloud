/**
 * Returns the base app URL, with fallbacks suitable for all environments.
 *
 * Priority:
 * 1. APP_URL (server-side, set explicitly)
 * 2. NEXT_PUBLIC_APP_URL (client+server, set explicitly)
 * 3. VERCEL_URL (auto-set by Vercel per deployment — covers preview without manual config)
 * 4. http://localhost:3000 (local dev)
 */
export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
