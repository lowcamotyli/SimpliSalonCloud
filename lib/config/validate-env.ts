/**
 * Walidacja zmiennych środowiskowych
 * Wywołaj tę funkcję na starcie aplikacji aby upewnić się, że wszystkie wymagane secrets są ustawione
 */

interface EnvValidationResult {
  valid: boolean
  missing: string[]
  errors: string[]
}

/**
 * Lista wymaganych zmiennych środowiskowych dla development
 */
const REQUIRED_DEV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

/**
 * Lista wymaganych zmiennych środowiskowych dla production
 */
const REQUIRED_PROD_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALLOWED_ORIGINS',
  'MESSAGING_ENCRYPTION_KEY',
  'CRON_SECRET',
  // Payment (opcjonalne na początek, wymagane gdy feature jest aktywny)
  // 'P24_MERCHANT_ID',
  // 'P24_POS_ID',
  // 'P24_CRC',
  // 'P24_API_URL',
  // Email (opcjonalne na początek)
  // 'RESEND_API_KEY',
  // Monitoring (opcjonalne na początek)
  // 'NEXT_PUBLIC_SENTRY_DSN',
  // Rate limiting (opcjonalne - gracefully degrades without it)
  // 'UPSTASH_REDIS_REST_URL',
  // 'UPSTASH_REDIS_REST_TOKEN',
]

/**
 * Waliduje czy wszystkie wymagane zmienne środowiskowe są ustawione
 *
 * @param throwOnError - Czy rzucić błąd gdy walidacja failuje (default: true)
 * @returns EnvValidationResult
 */
export function validateEnv(throwOnError: boolean = true): EnvValidationResult {
  const isProduction = process.env.NODE_ENV === 'production'
  const requiredVars = isProduction ? REQUIRED_PROD_VARS : REQUIRED_DEV_VARS

  const missing: string[] = []
  const errors: string[] = []

  // Sprawdź czy wszystkie wymagane zmienne istnieją
  for (const key of requiredVars) {
    const value = process.env[key]

    if (!value || value.trim() === '') {
      missing.push(key)
      errors.push(`Missing required environment variable: ${key}`)
    }
  }

  // Walidacja formatów (URL, UUID, etc.)
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    } catch {
      errors.push(
        'Invalid NEXT_PUBLIC_SUPABASE_URL: must be a valid URL'
      )
    }
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      new URL(process.env.NEXT_PUBLIC_APP_URL)
    } catch {
      errors.push('Invalid NEXT_PUBLIC_APP_URL: must be a valid URL')
    }
  }

  // Sprawdź ALLOWED_ORIGINS format (comma-separated URLs)
  if (process.env.ALLOWED_ORIGINS && isProduction) {
    const origins = process.env.ALLOWED_ORIGINS.split(',')
    for (const origin of origins) {
      try {
        new URL(origin.trim())
      } catch {
        errors.push(`Invalid ALLOWED_ORIGINS: "${origin.trim()}" is not a valid URL`)
      }
    }
  }

  const valid = missing.length === 0 && errors.length === 0

  if (!valid && throwOnError) {
    console.error('❌ Environment validation failed!')
    console.error('Missing variables:', missing)
    console.error('Errors:', errors)
    throw new Error(
      `Environment validation failed. Missing: ${missing.join(', ')}`
    )
  }

  if (valid) {
    console.log('✅ Environment validation passed')
  }

  return {
    valid,
    missing,
    errors,
  }
}

/**
 * Sprawdza czy optional feature jest skonfigurowany
 *
 * @param feature - Nazwa feature ('payment', 'email', 'monitoring', 'rate-limiting')
 * @returns boolean
 */
export function isFeatureConfigured(
  feature: 'payment' | 'email' | 'monitoring' | 'rate-limiting'
): boolean {
  switch (feature) {
    case 'payment':
      return !!(
        process.env.P24_MERCHANT_ID &&
        process.env.P24_POS_ID &&
        process.env.P24_CRC &&
        process.env.P24_API_URL
      )

    case 'email':
      return !!process.env.RESEND_API_KEY

    case 'monitoring':
      return !!process.env.NEXT_PUBLIC_SENTRY_DSN

    case 'rate-limiting':
      return !!(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      )

    default:
      return false
  }
}

/**
 * Loguje status konfiguracji optional features
 */
export function logFeatureStatus() {
  console.log('📦 Feature Configuration Status:')
  console.log('  Payment (Przelewy24):', isFeatureConfigured('payment') ? '✅' : '❌')
  console.log('  Email (Resend):', isFeatureConfigured('email') ? '✅' : '❌')
  console.log('  Monitoring (Sentry):', isFeatureConfigured('monitoring') ? '✅' : '❌')
  console.log('  Rate Limiting (Upstash):', isFeatureConfigured('rate-limiting') ? '✅' : '❌')
}
