'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  TrendingUp,
  Calendar,
  Loader2,
  Sparkles,
  Shield,
  Zap,
  Users,
  BarChart3,
  Clock,
  ArrowUpRight,
  Lock,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktywna',
  trialing: 'Okres próbny',
  past_due: 'Zaległa płatność',
  canceled: 'Anulowana',
  expired: 'Wygasła',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-primary/10 text-primary border-primary/20',
  trialing: 'bg-secondary text-secondary-foreground border-secondary',
  past_due: 'bg-destructive/10 text-destructive border-destructive/20',
  canceled: 'bg-muted text-muted-foreground border-border',
  expired: 'bg-muted text-muted-foreground border-border',
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, { from: string; to: string; badge: string }> = {
  starter: { from: 'from-muted-foreground/50', to: 'to-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  professional: { from: 'from-primary/80', to: 'to-primary', badge: 'bg-primary/10 text-primary' },
  business: { from: 'from-secondary', to: 'to-secondary/80', badge: 'bg-secondary/20 text-secondary-foreground' },
  enterprise: { from: 'from-accent', to: 'to-accent/80', badge: 'bg-accent/20 text-accent-foreground' },
}

function UsageBar({ label, current, limit, icon: Icon }: {
  label: string
  current: number
  limit: number | typeof Infinity
  icon: React.ElementType
}) {
  const isUnlimited = limit === Infinity
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const color = percentage > 90 ? 'from-destructive to-destructive/80' : percentage > 70 ? 'from-amber-500 to-amber-600' : 'from-primary to-primary/80'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </div>
        <span className="text-sm font-semibold text-foreground">
          {current}
          <span className="text-muted-foreground font-normal"> / {isUnlimited ? '∞' : limit}</span>
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
        {isUnlimited ? (
          <div className="h-2.5 rounded-full bg-gradient-to-r from-primary to-primary/80 w-full opacity-30" />
        ) : (
          <div
            className={`h-2.5 rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  )
}

export default function BillingPage() {
  const params = useParams()
  const slug = params?.slug as string
  const queryClient = useQueryClient()
  const [canceling, setCanceling] = useState(false)

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', slug],
    queryFn: async () => {
      const res = await fetch(`/api/subscriptions/${slug}`)
      if (!res.ok) throw new Error('Failed to fetch subscription')
      return res.json()
    },
  })

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['usage', slug],
    queryFn: async () => {
      const res = await fetch('/api/subscriptions/usage')
      if (!res.ok) throw new Error('Failed to fetch usage')
      return res.json()
    },
  })

  const handleCancel = async () => {
    if (!confirm('Czy na pewno chcesz anulować subskrypcję? Anulacja wejdzie w życie na koniec okresu rozliczeniowego.')) return

    setCanceling(true)
    try {
      const res = await fetch('/api/payments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediately: false }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Nie udało się anulować subskrypcji')
      }

      toast.success('Subskrypcja zostanie anulowana na koniec okresu rozliczeniowego')
      queryClient.invalidateQueries({ queryKey: ['subscription', slug] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
    } finally {
      setCanceling(false)
    }
  }

  const isLoading = subLoading || usageLoading

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-10 w-64 bg-muted rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded-2xl" />
              <div className="h-48 bg-muted rounded-2xl" />
            </div>
            <div className="space-y-6">
              <div className="h-48 bg-muted rounded-2xl" />
              <div className="h-32 bg-muted rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const plan = subscription?.plan || 'starter'
  const status = subscription?.status || 'trialing'
  const trialEndsAt = subscription?.trialEndsAt
  const currentPeriodEnd = subscription?.currentPeriodEnd
  const planColors = PLAN_COLORS[plan] || PLAN_COLORS.starter

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-10 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Subskrypcja i Płatności
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Zarządzaj swoim planem, płatnościami i fakturami
          </p>
        </div>
        <Link href={`/${slug}/billing/upgrade`}>
          <Button className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/20 gap-2 font-medium transition-all duration-300 transform hover:scale-[1.02]">
            <TrendingUp className="h-4 w-4" />
            Zmień Plan
          </Button>
        </Link>
      </div>

      {/* Alert Banners */}
      {status === 'trialing' && trialEndsAt && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Okres próbny kończy się {new Date(trialEndsAt).toLocaleDateString('pl-PL')}
                </p>
                <p className="text-sm text-primary">
                  Wybierz plan aby kontynuować korzystanie z SimpliSalon bez przerwy
                </p>
              </div>
            </div>
            <Link href={`/${slug}/billing/upgrade`}>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-md">
                Wybierz Plan
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'past_due' && (
        <div className="relative overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-destructive">Płatność nieudana</p>
                <p className="text-sm text-destructive/80">
                  Zaktualizuj metodę płatności aby kontynuować korzystanie z usługi
                </p>
              </div>
            </div>
            <Link href={`/${slug}/billing/upgrade`}>
              <Button variant="destructive" className="gap-1.5 shadow-md">
                Zaktualizuj Płatność
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Current Plan Card */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* Gradient top bar */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${planColors.from} ${planColors.to}`} />

            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Obecny plan</p>
                  <h2 className="text-3xl font-bold text-foreground">{PLAN_LABELS[plan] || plan}</h2>
                  {subscription?.amount && (
                    <p className="text-muted-foreground mt-1 text-lg">
                      <span className="font-semibold text-foreground">{subscription.amount / 100} PLN</span>
                      {' '}/ {subscription.billingInterval === 'monthly' ? 'miesiąc' : 'rok'}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
                  {status === 'active' && <CheckCircle className="h-3.5 w-3.5" />}
                  {status === 'trialing' && <Sparkles className="h-3.5 w-3.5" />}
                  {status === 'past_due' && <XCircle className="h-3.5 w-3.5" />}
                  {STATUS_LABELS[status] || status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {currentPeriodEnd && (
                  <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm text-primary">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Następne odnowienie</p>
                      <p className="text-sm font-semibold text-foreground">
                        {new Date(currentPeriodEnd).toLocaleDateString('pl-PL')}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm text-primary">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bezpieczeństwo</p>
                    <p className="text-sm font-semibold text-foreground">SSL / TLS</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm text-primary">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-sm font-semibold text-foreground">99.9% SLA</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <Link href={`/${slug}/billing/upgrade`}>
                  <Button className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/20 gap-2 font-medium transition-all duration-300 transform hover:scale-[1.02]">
                    <TrendingUp className="h-4 w-4" />
                    Zmień Plan
                  </Button>
                </Link>
                {status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={canceling}
                    className="border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                  >
                    {canceling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Anuluj Subskrypcję
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Wykorzystanie zasobów
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">Bieżący okres rozliczeniowy</p>
              </div>
              {usage?.exceeded && usage.exceeded.length > 0 && (
                <Badge variant="destructive">
                  Limity przekroczone
                </Badge>
              )}
            </div>

            {usage ? (
              <div className="space-y-5">
                <UsageBar
                  label="Pracownicy"
                  current={usage.usage.employees.current}
                  limit={usage.usage.employees.limit}
                  icon={Users}
                />
                {usage.usage.bookings.limit < Infinity && (
                  <UsageBar
                    label="Rezerwacje (ten miesiąc)"
                    current={usage.usage.bookings.current}
                    limit={usage.usage.bookings.limit}
                    icon={Calendar}
                  />
                )}
                {usage.usage.clients.limit < Infinity && (
                  <UsageBar
                    label="Klienci"
                    current={usage.usage.clients.current}
                    limit={usage.usage.clients.limit}
                    icon={Users}
                  />
                )}

                {usage.exceeded && usage.exceeded.length > 0 && (
                  <div className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-destructive">
                          Osiągnięto limity: {usage.exceeded.join(', ')}
                        </p>
                        <p className="text-sm text-destructive/80 mt-1">
                          Przejdź na wyższy plan, aby odblokować więcej zasobów.
                        </p>
                        <Link href={`/${slug}/billing/upgrade`}>
                          <Button variant="link" size="sm" className="text-destructive p-0 h-auto mt-1 font-semibold">
                            Przejdź na wyższy plan →
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Brak danych o wykorzystaniu</p>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">

          {/* Payment Method */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-primary" />
              Metoda Płatności
            </h2>

            {subscription?.paymentMethod ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background shadow-sm">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {subscription.paymentMethod.type === 'card' ? (
                        <>{subscription.paymentMethod.brand} •••• {subscription.paymentMethod.last4}</>
                      ) : subscription.paymentMethod.type === 'blik' ? (
                        'BLIK'
                      ) : (
                        'Przelew bankowy'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Aktywna metoda płatności</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground px-1">
                  Zostanie użyta przy następnym odnowieniu subskrypcji
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Brak zapisanej metody płatności
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Zostaniesz poproszony o płatność przy następnym odnowieniu
                </p>
              </div>
            )}
          </div>

          {/* Przelewy24 Placeholder */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary to-primary/80 px-5 py-4">
              <h2 className="text-base font-semibold text-primary-foreground flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Bezpieczne Płatności
              </h2>
              <p className="text-primary-foreground/80 text-xs mt-0.5">Powered by Przelewy24</p>
            </div>

            <div className="p-5 space-y-4">
              {/* P24 Logo placeholder */}
              <div className="flex items-center justify-center rounded-xl border border-border bg-muted/30 py-5">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-background border border-border shadow-sm px-4 py-2.5">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">P</span>
                    </div>
                    <span className="font-bold text-foreground text-sm tracking-wide">Przelewy24</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Integracja płatności w przygotowaniu</p>
                </div>
              </div>

              {/* Payment methods */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wide">Akceptowane metody</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Karta', icon: '💳' },
                    { label: 'BLIK', icon: '📱' },
                    { label: 'Przelew', icon: '🏦' },
                  ].map((method) => (
                    <div
                      key={method.label}
                      className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/50 py-2.5 px-2"
                    >
                      <span className="text-lg">{method.icon}</span>
                      <span className="text-xs text-muted-foreground font-medium">{method.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-accent/20 border border-accent/30 p-3">
                <p className="text-xs text-foreground flex items-start gap-1.5">
                  <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-accent" />
                  Integracja z Przelewy24 zostanie aktywowana wkrótce. Płatności będą obsługiwane automatycznie.
                </p>
              </div>
            </div>
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Informacje</h2>
            <div className="space-y-2.5">
              {[
                { icon: Shield, text: 'Płatności szyfrowane SSL/TLS' },
                { icon: CheckCircle, text: 'Faktury VAT 23% automatycznie' },
                { icon: Calendar, text: 'Anulacja na koniec okresu' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  {text}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Link href={`/${slug}/billing/invoices`}>
                <Button variant="outline" className="w-full text-muted-foreground hover:text-primary gap-2">
                  <FileText className="h-4 w-4" />
                  Zobacz wszystkie faktury
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
