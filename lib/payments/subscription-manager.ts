import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createPrzelewy24Client, Przelewy24Error } from './przelewy24-client'

/**
 * Subscription Manager
 *
 * Zarządza subskrypcjami, płatnościami i limitami użycia
 */

export type PlanType = 'starter' | 'professional' | 'business' | 'enterprise'
export type BillingInterval = 'monthly' | 'yearly'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'

interface PlanConfig {
  name: string
  monthlyPrice: number // w groszach
  yearlyPrice: number // w groszach (ze zniżką)
  limits: {
    employees: number
    bookings: number
    clients: number
  }
  features: string[]
}

// Konfiguracja planów
const PLANS: Record<PlanType, PlanConfig> = {
  starter: {
    name: 'Starter',
    monthlyPrice: 9900, // 99 PLN
    yearlyPrice: 99000, // 990 PLN (2 miesiące gratis)
    limits: {
      employees: 2,
      bookings: 100,
      clients: 50,
    },
    features: ['google_calendar', 'pdf_export', 'email_notifications'],
  },
  professional: {
    name: 'Professional',
    monthlyPrice: 29900, // 299 PLN
    yearlyPrice: 299000, // 2990 PLN
    limits: {
      employees: 10,
      bookings: Infinity,
      clients: Infinity,
    },
    features: [
      'google_calendar',
      'pdf_export',
      'email_notifications',
      'sms_notifications',
      'booksy_integration',
      'advanced_analytics',
    ],
  },
  business: {
    name: 'Business',
    monthlyPrice: 59900, // 599 PLN
    yearlyPrice: 599000, // 5990 PLN
    limits: {
      employees: Infinity,
      bookings: Infinity,
      clients: Infinity,
    },
    features: [
      'google_calendar',
      'pdf_export',
      'email_notifications',
      'sms_notifications',
      'booksy_integration',
      'advanced_analytics',
      'api_access',
      'multi_salon',
      'white_label',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 150000, // 1500 PLN (startowa cena)
    yearlyPrice: 1500000, // Custom pricing
    limits: {
      employees: Infinity,
      bookings: Infinity,
      clients: Infinity,
    },
    features: [
      'google_calendar',
      'pdf_export',
      'email_notifications',
      'sms_notifications',
      'booksy_integration',
      'advanced_analytics',
      'api_access',
      'multi_salon',
      'white_label',
      'dedicated_support',
      'custom_development',
      'sla_guarantee',
    ],
  },
}

export class SubscriptionManager {
  private supabase = createAdminSupabaseClient()
  private p24 = createPrzelewy24Client()

  /**
   * Tworzy nową subskrypcję dla salonu
   */
  async createSubscription(params: {
    salonId: string
    planType: PlanType
    billingInterval: BillingInterval
    paymentMethodId?: string
  }): Promise<{ subscriptionId: string; requiresPayment: boolean; paymentUrl?: string }> {
    const { salonId, planType, billingInterval, paymentMethodId } = params

    // Pobierz informacje o salonie
    const { data: salon, error: salonError } = await this.supabase
      .from('salons')
      .select('*')
      .eq('id', salonId)
      .single()

    if (salonError || !salon) {
      throw new Error('Salon not found')
    }

    // Oblicz cenę
    const plan = PLANS[planType]
    const amount = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice

    // Oblicz daty okresu
    const now = new Date()
    const periodEnd = new Date(now)
    if (billingInterval === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    }

    // Utwórz rekord subskrypcji
    const { data: subscription, error: subError } = await this.supabase
      .from('subscriptions')
      .insert({
        salon_id: salonId,
        plan_type: planType,
        billing_interval: billingInterval,
        status: 'active', // Zmieni się na 'past_due' jeśli płatność nie powiedzie się
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        amount_cents: amount,
        currency: 'PLN',
      })
      .select()
      .single()

    if (subError || !subscription) {
      throw new Error(`Failed to create subscription: ${subError?.message}`)
    }

    // Aktywuj feature flags dla planu
    await this.enablePlanFeatures(salonId, planType)

    // Jeśli to starter trial - nie wymagaj płatności
    if (planType === 'starter' && salon.subscription_status === 'trialing') {
      return {
        subscriptionId: subscription.id,
        requiresPayment: false,
      }
    }

    // Dla płatnych planów - utwórz płatność
    const sessionId = `sub-${subscription.id}-${Date.now()}`

    try {
      const { token, paymentUrl } = await this.p24.createTransaction({
        sessionId,
        amount,
        description: `SimpliSalon - ${plan.name} (${billingInterval === 'monthly' ? 'miesięcznie' : 'rocznie'})`,
        email: salon.billing_email || salon.owner_email,
        client: salon.name,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${salon.slug}/billing/success?session=${sessionId}`,
      })

      // Zapisz transaction ID
      await this.supabase
        .from('subscriptions')
        .update({
          p24_transaction_id: sessionId,
          status: 'past_due', // Zmieni się na 'active' po udanej płatności
        })
        .eq('id', subscription.id)

      return {
        subscriptionId: subscription.id,
        requiresPayment: true,
        paymentUrl,
      }
    } catch (error) {
      // Jeśli płatność nie powiodła się - oznacz subskrypcję jako past_due
      await this.supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('id', subscription.id)

      throw error
    }
  }

  /**
   * Upgrade/downgrade subskrypcji
   */
  async upgradeSubscription(params: {
    salonId: string
    newPlanType: PlanType
    billingInterval?: BillingInterval
  }): Promise<{ requiresPayment: boolean; paymentUrl?: string; proratedAmount?: number }> {
    const { salonId, newPlanType, billingInterval } = params

    // Pobierz aktualną subskrypcję
    const { data: currentSub } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('salon_id', salonId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!currentSub) {
      // Brak aktywnej subskrypcji - utwórz nową
      return await this.createSubscription({
        salonId,
        planType: newPlanType,
        billingInterval: billingInterval || 'monthly',
      })
    }

    // Oblicz prorated amount (proporcjonalny zwrot/dopłata)
    const oldPlan = PLANS[currentSub.plan_type as PlanType]
    const newPlan = PLANS[newPlanType]
    const interval = billingInterval || currentSub.billing_interval

    const oldPrice = interval === 'monthly' ? oldPlan.monthlyPrice : oldPlan.yearlyPrice
    const newPrice = interval === 'monthly' ? newPlan.monthlyPrice : newPlan.yearlyPrice

    const daysLeft = Math.ceil(
      (new Date(currentSub.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    const totalDays = interval === 'monthly' ? 30 : 365

    const unusedAmount = Math.floor((oldPrice * daysLeft) / totalDays)
    const proratedAmount = newPrice - unusedAmount

    // Zaktualizuj subskrypcję
    await this.supabase
      .from('subscriptions')
      .update({
        plan_type: newPlanType,
        billing_interval: interval,
        amount_cents: newPrice,
      })
      .eq('id', currentSub.id)

    // Zaktualizuj feature flags
    await this.enablePlanFeatures(salonId, newPlanType)

    // Jeśli upgrade (wyższa cena) - wymagaj natychmiastowej płatności prorated
    if (proratedAmount > 0) {
      const { data: salon } = await this.supabase
        .from('salons')
        .select('*')
        .eq('id', salonId)
        .single()

      if (!salon) throw new Error('Salon not found')

      const sessionId = `upgrade-${currentSub.id}-${Date.now()}`

      const { token, paymentUrl } = await this.p24.createTransaction({
        sessionId,
        amount: proratedAmount,
        description: `SimpliSalon - Upgrade do ${newPlan.name} (dopłata proporcjonalna)`,
        email: salon.billing_email || salon.owner_email,
        client: salon.name,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${salon.slug}/billing/success?session=${sessionId}`,
      })

      return {
        requiresPayment: true,
        paymentUrl,
        proratedAmount,
      }
    }

    // Downgrade - nie wymaga płatności, zastosuj od następnego okresu
    return {
      requiresPayment: false,
      proratedAmount,
    }
  }

  /**
   * Anuluje subskrypcję (na koniec okresu rozliczeniowego)
   */
  async cancelSubscription(salonId: string, immediately: boolean = false): Promise<void> {
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('salon_id', salonId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!subscription) {
      throw new Error('No active subscription found')
    }

    if (immediately) {
      // Natychmiastowa anulacja
      await this.supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)

      // Downgrade do starter trial
      await this.downgradeToStarter(salonId)
    } else {
      // Anulacja na koniec okresu
      await this.supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
          ended_at: subscription.current_period_end,
        })
        .eq('id', subscription.id)
    }
  }

  /**
   * Obsługa sukcesu płatności (wywołane z webhooka)
   */
  async handlePaymentSuccess(params: {
    salonId: string
    sessionId: string
    orderId: number
    amount: number
  }): Promise<void> {
    const { salonId, sessionId, orderId, amount } = params

    // Znajdź subskrypcję po transaction ID
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('salon_id', salonId)
      .eq('p24_transaction_id', sessionId)
      .single()

    if (!subscription) {
      console.error(`[SUBSCRIPTION] No subscription found for session ${sessionId}`)
      return
    }

    // Zaktualizuj status subskrypcji
    await this.supabase
      .from('subscriptions')
      .update({
        status: 'active',
        p24_order_id: orderId.toString(),
      })
      .eq('id', subscription.id)

    // Utwórz fakturę
    await this.createInvoice({
      salonId,
      subscriptionId: subscription.id,
      amount,
      p24TransactionId: sessionId,
      p24OrderId: orderId.toString(),
    })

    console.log(`[SUBSCRIPTION] Payment success for salon ${salonId}, subscription ${subscription.id}`)
  }

  /**
   * Obsługa błędu płatności
   */
  async handlePaymentFailure(params: {
    salonId: string
    sessionId: string
    reason?: string
  }): Promise<void> {
    const { salonId, sessionId, reason } = params

    // Znajdź subskrypcję
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('salon_id', salonId)
      .eq('p24_transaction_id', sessionId)
      .single()

    if (!subscription) return

    // Oznacz jako past_due
    await this.supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        metadata: {
          ...subscription.metadata,
          last_payment_error: reason,
          last_payment_attempt: new Date().toISOString(),
        },
      })
      .eq('id', subscription.id)

    console.error(`[SUBSCRIPTION] Payment failed for salon ${salonId}: ${reason}`)

    // TODO: Wyślij email z powiadomieniem o nieudanej płatności
  }

  /**
   * Włącza feature flags dla danego planu
   */
  private async enablePlanFeatures(salonId: string, planType: PlanType): Promise<void> {
    const plan = PLANS[planType]

    // Usuń wszystkie feature flags
    await this.supabase.from('feature_flags').delete().eq('salon_id', salonId)

    // Dodaj nowe feature flags
    const features = plan.features.map((feature) => ({
      salon_id: salonId,
      feature_name: feature,
      enabled: true,
    }))

    // Dodaj limity
    if (plan.limits.employees !== Infinity) {
      features.push({
        salon_id: salonId,
        feature_name: 'max_employees',
        enabled: true,
        limit_value: plan.limits.employees,
      } as any)
    }

    if (plan.limits.bookings !== Infinity) {
      features.push({
        salon_id: salonId,
        feature_name: 'max_bookings',
        enabled: true,
        limit_value: plan.limits.bookings,
      } as any)
    }

    if (plan.limits.clients !== Infinity) {
      features.push({
        salon_id: salonId,
        feature_name: 'max_clients',
        enabled: true,
        limit_value: plan.limits.clients,
      } as any)
    }

    await this.supabase.from('feature_flags').insert(features)
  }

  /**
   * Downgrade do darmowego planu Starter
   */
  private async downgradeToStarter(salonId: string): Promise<void> {
    // Ustaw trial na 14 dni od teraz
    const trialEnds = new Date()
    trialEnds.setDate(trialEnds.getDate() + 14)

    await this.supabase
      .from('salons')
      .update({
        subscription_plan: 'starter',
        subscription_status: 'trialing',
        trial_ends_at: trialEnds.toISOString(),
      })
      .eq('id', salonId)

    // Ustaw starter feature flags
    await this.enablePlanFeatures(salonId, 'starter')
  }

  /**
   * Tworzy fakturę VAT
   */
  private async createInvoice(params: {
    salonId: string
    subscriptionId: string
    amount: number
    p24TransactionId: string
    p24OrderId: string
  }): Promise<void> {
    const { salonId, subscriptionId, amount, p24TransactionId, p24OrderId } = params

    // Pobierz informacje o salonie
    const { data: salon } = await this.supabase
      .from('salons')
      .select('*')
      .eq('id', salonId)
      .single()

    if (!salon) throw new Error('Salon not found')

    // Pobierz subskrypcję
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single()

    if (!subscription) throw new Error('Subscription not found')

    const plan = PLANS[subscription.plan_type as PlanType]

    // Oblicz VAT (23%)
    const subtotal = Math.floor(amount / 1.23)
    const vat = amount - subtotal

    // Utwórz fakturę (invoice_number generuje się automatycznie przez trigger)
    await this.supabase.from('invoices').insert({
      salon_id: salonId,
      subscription_id: subscriptionId,
      status: 'paid',
      subtotal_cents: subtotal,
      tax_cents: vat,
      total_cents: amount,
      currency: 'PLN',
      billing_name: salon.name,
      billing_email: salon.billing_email || salon.owner_email,
      billing_address: salon.address || null,
      payment_method: 'p24',
      paid_at: new Date().toISOString(),
      p24_transaction_id: p24TransactionId,
      p24_order_id: p24OrderId,
      line_items: [
        {
          description: `SimpliSalon - ${plan.name} (${subscription.billing_interval === 'monthly' ? 'Miesięczna' : 'Roczna'} subskrypcja)`,
          quantity: 1,
          unit_price: subtotal,
          total: subtotal,
        },
      ],
    })

    // TODO: Wygeneruj PDF faktury i wyślij email
  }

  /**
   * Pobiera konfigurację planu
   */
  static getPlanConfig(planType: PlanType): PlanConfig {
    return PLANS[planType]
  }

  /**
   * Pobiera wszystkie dostępne plany
   */
  static getAllPlans(): Record<PlanType, PlanConfig> {
    return PLANS
  }
}

/**
 * Helper - tworzy instancję Subscription Manager
 */
export function createSubscriptionManager(): SubscriptionManager {
  return new SubscriptionManager()
}
