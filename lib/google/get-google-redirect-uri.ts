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
    return dedicatedRedirectUri
  }

  const legacyRedirectUri = normalizeConfiguredRedirectUri(process.env.GOOGLE_REDIRECT_URI, callbackPath)
  if (legacyRedirectUri) {
    return legacyRedirectUri
  }

  return `${getAppUrl()}${callbackPath}`
}

export function getGmailSendRedirectUri(): string {
  return getGoogleRedirectUri('GOOGLE_GMAIL_SEND_REDIRECT_URI', '/api/integrations/gmail-send/callback')
}

export function getBooksyGmailRedirectUri(): string {
  return getGoogleRedirectUri('GOOGLE_BOOKSY_REDIRECT_URI', '/api/integrations/gmail/callback')
}
