import { getAppUrl } from '@/lib/config/app-url'

function normalizeConfiguredRedirectUri(value: string | undefined, expectedPath: string): string | null {
  const candidate = value?.trim()

  if (!candidate) {
    return null
  }

  try {
    const url = new URL(candidate)
    const normalizedPath = url.pathname.replace(/\/$/, '')

    if (normalizedPath !== expectedPath) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function getGoogleRedirectUri(dedicatedEnvKey: string, callbackPath: string): string {
  const dedicatedRedirectUri = normalizeConfiguredRedirectUri(process.env[dedicatedEnvKey], callbackPath)
  if (dedicatedRedirectUri) {
    console.log(`[redirect-uri] source=env:${dedicatedEnvKey} raw="${process.env[dedicatedEnvKey]}" resolved="${dedicatedRedirectUri}"`)
    return dedicatedRedirectUri
  }

  const legacyRedirectUri = normalizeConfiguredRedirectUri(process.env.GOOGLE_REDIRECT_URI, callbackPath)
  if (legacyRedirectUri) {
    console.log(`[redirect-uri] source=env:GOOGLE_REDIRECT_URI raw="${process.env.GOOGLE_REDIRECT_URI}" resolved="${legacyRedirectUri}"`)
    return legacyRedirectUri
  }

  const fallback = `${getAppUrl()}${callbackPath}`
  console.log(`[redirect-uri] source=getAppUrl() resolved="${fallback}" | APP_URL="${process.env.APP_URL}" NEXT_PUBLIC_APP_URL="${process.env.NEXT_PUBLIC_APP_URL}" VERCEL_BRANCH_URL="${process.env.VERCEL_BRANCH_URL}" VERCEL_URL="${process.env.VERCEL_URL}" VERCEL_PROJECT_PRODUCTION_URL="${process.env.VERCEL_PROJECT_PRODUCTION_URL}"`)
  return fallback
}

export function getGmailSendRedirectUri(): string {
  return getGoogleRedirectUri('GOOGLE_GMAIL_SEND_REDIRECT_URI', '/api/integrations/gmail-send/callback')
}

export function getBooksyGmailRedirectUri(): string {
  return getGoogleRedirectUri('GOOGLE_BOOKSY_REDIRECT_URI', '/api/integrations/gmail/callback')
}
