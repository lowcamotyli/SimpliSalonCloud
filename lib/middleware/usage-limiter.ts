import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { PlanType, SubscriptionManager } from '@/lib/payments/subscription-manager'

/**
 * Usage Limiter Middleware
 *
 * Sprawdza czy salon nie przekroczył limitów użycia swojego planu
 * - Employees (pracownicy)
 * - Bookings (rezerwacje per miesiąc)
 * - Clients (klienci)
 * - API calls (dla planów z dostępem API)
 */

export type ResourceType = 'bookings' | 'clients' | 'employees' | 'api_calls'

export interface UsageLimitResult {
  allowed: boolean
  current: number
  limit: number
  remaining: number
  resetDate?: Date
  message?: string
  upgradeUrl?: string
}

/**
 * Sprawdza czy salon może utworzyć nowy zasób danego typu
 */
export async function checkUsageLimits(
  salonId: string,
  resourceType: ResourceType
): Promise<UsageLimitResult> {
  const supabase = createAdminSupabaseClient()

  // Pobierz informacje o salonie i jego planie
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select('id, slug, subscription_plan, subscription_status')
    .eq('id', salonId)
    .single()

  if (salonError || !salon) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      remaining: 0,
      message: 'Salon not found',
    }
  }

  // Pobierz konfigurację planu
  const plan = SubscriptionManager.getPlanConfig(
    (salon.subscription_plan || 'starter') as PlanType
  )

  // Pobierz obecny usage
  const currentUsage = await getCurrentUsage(salonId, resourceType)

  // Określ limit dla tego typu zasobu
  let limit: number
  switch (resourceType) {
    case 'employees':
      limit = plan.limits.employees
      break
    case 'bookings':
      limit = plan.limits.bookings
      break
    case 'clients':
      limit = plan.limits.clients
      break
    case 'api_calls':
      // API calls - 1000/day dla business+, 0 dla reszty
      limit = plan.features.includes('api_access') ? 1000 : 0
      break
    default:
      limit = 0
  }

  // Oblicz czy dozwolone
  const allowed = currentUsage < limit
  const remaining = Math.max(0, limit - currentUsage)

  // Oblicz reset date (dla miesięcznych limitów)
  let resetDate: Date | undefined
  if (resourceType === 'bookings' || resourceType === 'api_calls') {
    resetDate = getNextMonthStart()
  }

  // Przygotuj wiadomość jeśli limit przekroczony
  let message: string | undefined
  let upgradeUrl: string | undefined

  if (!allowed) {
    const resourceNames = {
      bookings: 'rezerwacji',
      clients: 'klientów',
      employees: 'pracowników',
      api_calls: 'wywołań API',
    }

    message = `Osiągnięto limit ${limit} ${resourceNames[resourceType]} dla planu ${plan.name}. `

    if (salon.subscription_plan === 'starter') {
      message += 'Przejdź na wyższy plan aby zwiększyć limity.'
      upgradeUrl = `/${salon.slug}/billing/upgrade`
    } else if (salon.subscription_plan === 'professional') {
      message += 'Przejdź na plan Business aby uzyskać nieograniczone zasoby.'
      upgradeUrl = `/${salon.slug}/billing/upgrade`
    }
  }

  return {
    allowed,
    current: currentUsage,
    limit,
    remaining,
    resetDate,
    message,
    upgradeUrl,
  }
}

/**
 * Inkrementuje licznik użycia dla danego zasobu
 */
export async function incrementUsage(
  salonId: string,
  resourceType: ResourceType,
  incrementBy: number = 1
): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const currentMonth = getCurrentMonth()

  // Pobierz lub utwórz rekord usage_tracking
  const { data: existing } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('salon_id', salonId)
    .eq('period_month', currentMonth)
    .single()

  if (existing) {
    // Update istniejącego rekordu
    const updates: any = {}

    switch (resourceType) {
      case 'bookings':
        updates.bookings_count = existing.bookings_count + incrementBy
        break
      case 'clients':
        updates.clients_count = existing.clients_count + incrementBy
        break
      case 'employees':
        updates.employees_count = existing.employees_count + incrementBy
        break
      case 'api_calls':
        updates.api_calls_count = existing.api_calls_count + incrementBy
        break
    }

    await supabase
      .from('usage_tracking')
      .update(updates)
      .eq('id', existing.id)
  } else {
    // Utwórz nowy rekord
    const newRecord: any = {
      salon_id: salonId,
      period_month: currentMonth,
      bookings_count: 0,
      clients_count: 0,
      employees_count: 0,
      api_calls_count: 0,
    }

    switch (resourceType) {
      case 'bookings':
        newRecord.bookings_count = incrementBy
        break
      case 'clients':
        newRecord.clients_count = incrementBy
        break
      case 'employees':
        newRecord.employees_count = incrementBy
        break
      case 'api_calls':
        newRecord.api_calls_count = incrementBy
        break
    }

    await supabase.from('usage_tracking').insert(newRecord)
  }
}

/**
 * Dekrementuje licznik użycia (np. gdy usunięto booking)
 */
export async function decrementUsage(
  salonId: string,
  resourceType: ResourceType,
  decrementBy: number = 1
): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const currentMonth = getCurrentMonth()

  const { data: existing } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('salon_id', salonId)
    .eq('period_month', currentMonth)
    .single()

  if (!existing) return

  const updates: any = {}

  switch (resourceType) {
    case 'bookings':
      updates.bookings_count = Math.max(0, existing.bookings_count - decrementBy)
      break
    case 'clients':
      updates.clients_count = Math.max(0, existing.clients_count - decrementBy)
      break
    case 'employees':
      updates.employees_count = Math.max(0, existing.employees_count - decrementBy)
      break
    case 'api_calls':
      updates.api_calls_count = Math.max(0, existing.api_calls_count - decrementBy)
      break
  }

  await supabase
    .from('usage_tracking')
    .update(updates)
    .eq('id', existing.id)
}

/**
 * Pobiera obecny usage dla danego typu zasobu
 */
async function getCurrentUsage(salonId: string, resourceType: ResourceType): Promise<number> {
  const supabase = createAdminSupabaseClient()

  if (resourceType === 'employees') {
    // Employees - liczymy aktywnych pracowników (nie miesięcznie)
    const { count } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('active', true)
      .is('deleted_at', null)

    return count || 0
  }

  if (resourceType === 'clients') {
    // Clients - liczymy wszystkich klientów (nie miesięcznie)
    const { count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .is('deleted_at', null)

    return count || 0
  }

  // Bookings i API calls - miesięczne limity, pobierz z usage_tracking
  const currentMonth = getCurrentMonth()

  const { data: usage } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('salon_id', salonId)
    .eq('period_month', currentMonth)
    .single()

  if (!usage) {
    // Brak rekordu - policz ręcznie (dla backward compatibility)
    if (resourceType === 'bookings') {
      const firstDayOfMonth = new Date()
      firstDayOfMonth.setDate(1)
      firstDayOfMonth.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('salon_id', salonId)
        .gte('booking_date', firstDayOfMonth.toISOString())
        .is('deleted_at', null)

      return count || 0
    }

    return 0
  }

  switch (resourceType) {
    case 'bookings':
      return usage.bookings_count || 0
    case 'api_calls':
      return usage.api_calls_count || 0
    default:
      return 0
  }
}

/**
 * Helper: Pobiera obecny miesiąc w formacie YYYY-MM
 */
function getCurrentMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Helper: Pobiera datę początku następnego miesiąca
 */
function getNextMonthStart(): Date {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  return nextMonth
}

/**
 * Pobiera szczegółowy raport użycia dla salonu
 */
export async function getUsageReport(salonId: string): Promise<{
  plan: string
  period: string
  usage: {
    employees: { current: number; limit: number; percentage: number }
    bookings: { current: number; limit: number; percentage: number }
    clients: { current: number; limit: number; percentage: number }
    apiCalls: { current: number; limit: number; percentage: number }
  }
  exceeded: string[]
}> {
  const supabase = createAdminSupabaseClient()

  // Pobierz plan salonu
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_plan')
    .eq('id', salonId)
    .single()

  const planType = (salon?.subscription_plan || 'starter') as PlanType
  const plan = SubscriptionManager.getPlanConfig(planType)

  // Pobierz usage dla każdego typu
  const [employees, bookings, clients, apiCalls] = await Promise.all([
    checkUsageLimits(salonId, 'employees'),
    checkUsageLimits(salonId, 'bookings'),
    checkUsageLimits(salonId, 'clients'),
    checkUsageLimits(salonId, 'api_calls'),
  ])

  // Oblicz exceeded
  const exceeded: string[] = []
  if (!employees.allowed) exceeded.push('employees')
  if (!bookings.allowed) exceeded.push('bookings')
  if (!clients.allowed) exceeded.push('clients')
  if (!apiCalls.allowed) exceeded.push('api_calls')

  return {
    plan: plan.name,
    period: getCurrentMonth(),
    usage: {
      employees: {
        current: employees.current,
        limit: employees.limit,
        percentage: employees.limit > 0 ? (employees.current / employees.limit) * 100 : 0,
      },
      bookings: {
        current: bookings.current,
        limit: bookings.limit,
        percentage: bookings.limit > 0 ? (bookings.current / bookings.limit) * 100 : 0,
      },
      clients: {
        current: clients.current,
        limit: clients.limit,
        percentage: clients.limit > 0 ? (clients.current / clients.limit) * 100 : 0,
      },
      apiCalls: {
        current: apiCalls.current,
        limit: apiCalls.limit,
        percentage: apiCalls.limit > 0 ? (apiCalls.current / apiCalls.limit) * 100 : 0,
      },
    },
    exceeded,
  }
}
