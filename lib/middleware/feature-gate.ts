import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { PlanType, SubscriptionManager } from '@/lib/payments/subscription-manager'

/**
 * Feature Gate Middleware
 *
 * Kontroluje dostęp do funkcjonalności w zależności od planu subskrypcji
 */

export type FeatureName =
  | 'google_calendar'
  | 'booksy_integration'
  | 'pdf_export'
  | 'sms_notifications'
  | 'crm_sms'
  | 'crm_campaigns'
  | 'crm_automations'
  | 'email_notifications'
  | 'api_access'
  | 'multi_salon'
  | 'white_label'
  | 'advanced_analytics'
  | 'dedicated_support'
  | 'custom_development'
  | 'sla_guarantee'

export const FEATURE_TRANSLATIONS: Record<FeatureName, string> = {
  google_calendar: 'Integracja z Kalendarzem Google',
  booksy_integration: 'Integracja z Booksy',
  pdf_export: 'Eksport do PDF',
  sms_notifications: 'Powiadomienia SMS',
  crm_sms: 'Wiadomości SMS (CRM)',
  crm_campaigns: 'Kampanie CRM',
  crm_automations: 'Automatyzacje CRM',
  email_notifications: 'Powiadomienia Email',
  api_access: 'Dostęp do API',
  multi_salon: 'Obsługa wielu salonów',
  white_label: 'White Label',
  advanced_analytics: 'Zaawansowana analityka',
  dedicated_support: 'Dedykowane wsparcie',
  custom_development: 'Rozwój na życzenie',
  sla_guarantee: 'Gwarancja SLA',
}

export interface FeatureAccessResult {
  allowed: boolean
  feature: FeatureName
  reason?: string
  upgradeUrl?: string
  requiredPlan?: string
}

/**
 * Sprawdza czy salon ma dostęp do danej funkcjonalności
 */
export async function checkFeatureAccess(
  salonId: string,
  featureName: FeatureName
): Promise<FeatureAccessResult> {
  const supabase = createAdminSupabaseClient()

  // Pobierz informacje o salonie
  const { data: salon } = await supabase
    .from('salons')
    .select('id, slug, subscription_plan, subscription_status')
    .eq('id', salonId)
    .single()

  if (!salon) {
    return {
      allowed: false,
      feature: featureName,
      reason: 'Salon not found',
    }
  }

  // Sprawdź czy subskrypcja jest aktywna
  if (salon.subscription_status === 'canceled' || salon.subscription_status === 'past_due') {
    return {
      allowed: false,
      feature: featureName,
      reason: 'Subscription is not active',
      upgradeUrl: `/${salon.slug}/billing`,
    }
  }

  // Pobierz feature flag z bazy
  // SECURITY: maybeSingle() zwraca { data: null, error: null } gdy brak rekordu.
  // .single() zwracałby { error: PGRST116 } co było nie do odróżnienia od błędu DB.
  const { data: featureFlag, error: featureFlagError } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('salon_id', salonId)
    .eq('feature_name', featureName)
    .maybeSingle()

  // Fail-secure: błąd DB = brak dostępu (nie otwieramy dostępu przy awarii)
  if (featureFlagError) {
    return { allowed: false, feature: featureName, reason: 'Feature access check failed' }
  }

  // Jeśli nie ma rekordu, sprawdź czy plan obejmuje tę feature
  if (!featureFlag) {
    const plan = SubscriptionManager.getPlanConfig(
      (salon.subscription_plan || 'starter') as PlanType
    )

    const planHasFeature = plan.features.includes(featureName)

    if (!planHasFeature) {
      // Określ który plan ma tę feature
      const requiredPlan = getMinimalPlanForFeature(featureName)

      return {
        allowed: false,
        feature: featureName,
        reason: `Funkcja "${FEATURE_TRANSLATIONS[featureName] || featureName}" jest niedostępna w planie ${plan.name}`,
        upgradeUrl: `/${salon.slug}/billing/upgrade`,
        requiredPlan,
      }
    }

    // Plan ma feature, ale brak rekordu w bazie - prawdopodobnie nowa instalacja
    // Pozwól na dostęp
    return {
      allowed: true,
      feature: featureName,
    }
  }

  // Sprawdź czy feature jest włączona
  if (!featureFlag.enabled) {
    return {
      allowed: false,
      feature: featureName,
      reason: `Funkcja "${FEATURE_TRANSLATIONS[featureName] || featureName}" jest wyłączona`,
    }
  }

  // Sprawdź expiration
  if (featureFlag.expires_at && new Date(featureFlag.expires_at) < new Date()) {
    return {
      allowed: false,
      feature: featureName,
      reason: `Funkcja "${FEATURE_TRANSLATIONS[featureName] || featureName}" wygasła`,
      upgradeUrl: `/${salon.slug}/billing/upgrade`,
    }
  }

  // Wszystko OK - pozwól na dostęp
  return {
    allowed: true,
    feature: featureName,
  }
}

/**
 * Sprawdza dostęp do wielu features na raz
 */
export async function checkMultipleFeatures(
  salonId: string,
  featureNames: FeatureName[]
): Promise<Record<FeatureName, FeatureAccessResult>> {
  const results = await Promise.all(
    featureNames.map((name) => checkFeatureAccess(salonId, name))
  )

  return featureNames.reduce(
    (acc, name, index) => {
      acc[name] = results[index]
      return acc
    },
    {} as Record<FeatureName, FeatureAccessResult>
  )
}

/**
 * Włącza feature dla salonu
 */
export async function enableFeature(
  salonId: string,
  featureName: FeatureName,
  expiresAt?: Date
): Promise<void> {
  const supabase = createAdminSupabaseClient()

  await supabase.from('feature_flags').upsert({
    salon_id: salonId,
    feature_name: featureName,
    enabled: true,
    expires_at: expiresAt?.toISOString(),
  })
}

/**
 * Wyłącza feature dla salonu
 */
export async function disableFeature(
  salonId: string,
  featureName: FeatureName
): Promise<void> {
  const supabase = createAdminSupabaseClient()

  await supabase
    .from('feature_flags')
    .update({ enabled: false })
    .eq('salon_id', salonId)
    .eq('feature_name', featureName)
}

/**
 * Pobiera wszystkie aktywne features dla salonu
 */
export async function getActiveFeatures(salonId: string): Promise<FeatureName[]> {
  const supabase = createAdminSupabaseClient()

  const { data: features } = await supabase
    .from('feature_flags')
    .select('feature_name')
    .eq('salon_id', salonId)
    .eq('enabled', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  return (features || []).map((f: any) => f.feature_name as FeatureName)
}

/**
 * Helper: Określa minimalny plan wymagany dla danej feature
 */
function getMinimalPlanForFeature(featureName: FeatureName): string {
  const plans = SubscriptionManager.getAllPlans()

  // Sprawdź plany od najtańszego do najdroższego
  const planOrder: PlanType[] = ['starter', 'professional', 'business', 'enterprise']

  for (const planType of planOrder) {
    const plan = plans[planType]
    if (plan.features.includes(featureName)) {
      return plan.name
    }
  }

  return 'Enterprise'
}

/**
 * Helper: Pobiera mapowanie feature -> minimall wymagany plan
 */
export function getFeaturePlanRequirements(): Record<FeatureName, string> {
  return {
    google_calendar: 'Starter',
    pdf_export: 'Starter',
    email_notifications: 'Starter',
    sms_notifications: 'Professional',
    crm_sms: 'Professional',
    crm_campaigns: 'Professional',
    crm_automations: 'Professional',
    booksy_integration: 'Professional',
    advanced_analytics: 'Professional',
    api_access: 'Business',
    multi_salon: 'Business',
    white_label: 'Business',
    dedicated_support: 'Enterprise',
    custom_development: 'Enterprise',
    sla_guarantee: 'Enterprise',
  }
}

/**
 * Wrapper dla middleware - blokuje request jeśli feature niedostępna
 */
export async function requireFeature(
  salonId: string,
  featureName: FeatureName
): Promise<{ allowed: boolean; error?: { message: string; upgradeUrl?: string; status: number } }> {
  const result = await checkFeatureAccess(salonId, featureName)

  if (!result.allowed) {
    return {
      allowed: false,
      error: {
        message: result.reason || `Funkcja "${FEATURE_TRANSLATIONS[featureName] || featureName}" jest niedostępna`,
        upgradeUrl: result.upgradeUrl,
        status: 403,
      },
    }
  }

  return { allowed: true }
}
