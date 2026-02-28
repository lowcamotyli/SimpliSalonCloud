'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  ArrowUpRight,
  Lock,
  FileText,
  Activity,
  CreditCard as CardIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktywna',
  trialing: 'Okres próbny',
  past_due: 'Zaległa płatność',
  canceled: 'Anulowana',
  expired: 'Wygasła',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  trialing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  past_due: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  canceled: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
  expired: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, { from: string; to: string; badge: string; shadow: string }> = {
  starter: { from: 'from-slate-400', to: 'to-slate-600', badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', shadow: 'shadow-slate-500/20' },
  professional: { from: 'from-blue-500', to: 'to-indigo-600', badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', shadow: 'shadow-blue-500/20' },
  business: { from: 'from-violet-500', to: 'to-purple-600', badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', shadow: 'shadow-violet-500/20' },
  enterprise: { from: 'from-amber-400', to: 'to-orange-500', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', shadow: 'shadow-amber-500/20' },
}

function UsageBar({ label, current, limit, icon: Icon }: {
  label: string
  current: number
  limit: number | typeof Infinity
  icon: React.ElementType
}) {
  const isUnlimited = limit === Infinity
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const isDanger = percentage > 90
  const isWarning = percentage > 70 && !isDanger

  const color = isDanger
    ? 'from-red-500 to-rose-600 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
    : isWarning
      ? 'from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
      : 'from-emerald-400 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'

  return (
    <div className="space-y-2.5 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-300">
          <div className={cn(
            "p-1.5 rounded-md transition-colors duration-300",
            isDanger ? "bg-red-500/10 text-red-500 dark:text-red-400" : isWarning ? "bg-amber-500/10 text-amber-500 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
          )}>
            <Icon className="h-4 w-4" />
          </div>
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn(
            "text-base font-bold transition-colors duration-300",
            isDanger ? "text-red-500 dark:text-red-400" : "text-foreground"
          )}>
            {current}
          </span>
          <span className="text-sm text-muted-foreground font-medium">/ {isUnlimited ? '∞' : limit}</span>
        </div>
      </div>
      <div className="relative w-full bg-secondary/50 rounded-full h-2 overflow-hidden backdrop-blur-sm border border-border/50">
        {isUnlimited ? (
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-teal-500 w-full opacity-30" />
        ) : (
          <div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${color} transition-all duration-1000 ease-out`}
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
              <div className="h-64 bg-muted/40 rounded-3xl" />
              <div className="h-48 bg-muted/40 rounded-3xl" />
            </div>
            <div className="space-y-6">
              <div className="h-48 bg-muted/40 rounded-3xl" />
              <div className="h-32 bg-muted/40 rounded-3xl" />
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
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
            <Activity className="h-3.5 w-3.5" />
            Rozliczenia
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            Subskrypcja i Płatności
          </h1>
          <p className="text-muted-foreground text-base max-w-xl">
            Zarządzaj swoim planem, limitami wykorzystania oraz historią płatności
          </p>
        </div>
        <Link href={`/${slug}/billing/upgrade`} className="shrink-0">
          <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-white shadow-lg shadow-primary/25 gap-2 font-semibold transition-all duration-300 transform hover:scale-[1.03] hover:-translate-y-0.5 rounded-xl">
            <Sparkles className="h-4 w-4" />
            Zmień Plan
          </Button>
        </Link>
      </div>

      {/* Alert Banners */}
      {status === 'trialing' && trialEndsAt && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-background/50 backdrop-blur-md shadow-lg shadow-primary/5 p-5 md:p-6 group transition-all duration-300 hover:border-primary/40">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-inner">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground tracking-tight">
                  Okres próbny kończy się {new Date(trialEndsAt).toLocaleDateString('pl-PL')}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Wybierz plan aby kontynuować korzystanie bez przerw w dostępie
                </p>
              </div>
            </div>
            <Link href={`/${slug}/billing/upgrade`} className="self-stretch sm:self-auto">
              <Button className="w-full sm:w-auto bg-primary text-primary-foreground gap-2 shadow-md hover:shadow-xl transition-all duration-300 rounded-xl">
                Wybierz Plan
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {status === 'past_due' && (
        <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-background/50 backdrop-blur-md shadow-lg shadow-red-500/10 p-5 md:p-6 group transition-all duration-300 hover:border-red-500/50">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-red-500/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/20 shadow-inner">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-500 tracking-tight">Płatność nieudana</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Zaktualizuj metodę płatności aby odblokować pełen dostęp
                </p>
              </div>
            </div>
            <Link href={`/${slug}/billing/upgrade`} className="self-stretch sm:self-auto">
              <Button variant="destructive" className="w-full sm:w-auto gap-2 shadow-md hover:shadow-xl transition-all duration-300 rounded-xl">
                Zaktualizuj Płatność
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-8">

          {/* Current Plan Card */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xl hover:shadow-2xl hover:border-border/80 transition-all duration-500">
            {/* Dynamic decorative background elements */}
            <div className={`absolute top-0 right-0 -mt-20 -mr-20 h-64 w-64 rounded-full bg-gradient-to-br ${planColors.from} ${planColors.to} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />
            <div className={`absolute bottom-0 left-0 -mb-20 -ml-20 h-40 w-40 rounded-full bg-gradient-to-br ${planColors.from} ${planColors.to} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity duration-500`} />

            {/* Gradient Top Bar */}
            <div className={`absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r ${planColors.from} ${planColors.to}`} />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Obecny plan</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
                      {status === 'active' && <CheckCircle className="h-3 w-3" />}
                      {status === 'trialing' && <Sparkles className="h-3 w-3" />}
                      {status === 'past_due' && <XCircle className="h-3 w-3" />}
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                  <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70 mb-2">
                    {PLAN_LABELS[plan] || plan}
                  </h2>
                  {subscription?.amount ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold tracking-tight text-foreground">{subscription.amount / 100} PLN</span>
                      <span className="text-muted-foreground font-medium">/ {subscription.billingInterval === 'monthly' ? 'mc' : 'rok'}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">Brak danych rozliczeniowych</div>
                  )}
                </div>

                <div className={`hidden sm:flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${planColors.from} ${planColors.to} shadow-lg ${planColors.shadow} text-white transform rotate-3 group-hover:rotate-6 transition-transform duration-500`}>
                  <TrendingUp className="h-8 w-8" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {currentPeriodEnd && (
                  <div className="flex flex-col justify-center rounded-2xl border border-border/50 bg-background/50 p-4 transition-colors hover:bg-background/80">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Odnowienie</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {new Date(currentPeriodEnd).toLocaleDateString('pl-PL')}
                    </span>
                  </div>
                )}
                <div className="flex flex-col justify-center rounded-2xl border border-border/50 bg-background/50 p-4 transition-colors hover:bg-background/80">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Ochrona</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">SSL / TLS Zapewnione</span>
                </div>
                <div className="flex flex-col justify-center rounded-2xl border border-border/50 bg-background/50 p-4 transition-colors hover:bg-background/80">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Uptime</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">99.9% Gwarancji</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-6 border-t border-border/50">
                <Link href={`/${slug}/billing/upgrade`}>
                  <Button className="bg-foreground text-background hover:bg-foreground/90 hover:scale-105 transition-all duration-300 shadow-xl shadow-foreground/10 rounded-xl px-6 h-11 font-semibold text-sm">
                    Aktualizuj Plan
                  </Button>
                </Link>
                {status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={canceling}
                    className="border-border hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-all duration-300 rounded-xl px-6 h-11 font-medium bg-transparent"
                  >
                    {canceling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Anuluj Subskrypcję
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xl p-6 sm:p-8 hover:border-border/80 transition-all duration-500">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    Wykorzystanie Zasobów
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5 font-medium">Zależy od wybranego planu</p>
                </div>
              </div>
              {usage?.exceeded && usage.exceeded.length > 0 && (
                <Badge variant="destructive" className="px-3 py-1 shadow-lg shadow-destructive/20 rounded-full animate-pulse">
                  Przekroczone Limity
                </Badge>
              )}
            </div>

            {usage ? (
              <div className="space-y-6">
                <UsageBar
                  label="Pracownicy"
                  current={usage.usage.employees.current}
                  limit={usage.usage.employees.limit}
                  icon={Users}
                />
                <div className="h-px w-full bg-border/40" />
                {usage.usage.bookings.limit < Infinity && (
                  <>
                    <UsageBar
                      label="Rezerwacje w tym miesiącu"
                      current={usage.usage.bookings.current}
                      limit={usage.usage.bookings.limit}
                      icon={Calendar}
                    />
                    <div className="h-px w-full bg-border/40" />
                  </>
                )}
                {usage.usage.clients.limit < Infinity && (
                  <UsageBar
                    label="Klienci w bazie"
                    current={usage.usage.clients.current}
                    limit={usage.usage.clients.limit}
                    icon={Users}
                  />
                )}

                {usage.exceeded && usage.exceeded.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-inner">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-full bg-red-500/10 mt-0.5">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-red-500 dark:text-red-400">
                          Wymagana akcja: Osiągnięto limity
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">
                          Zablokowano niektóre funkcje ({usage.exceeded.join(', ')}). Zwiększ plan, aby kontynuować bez przeszkód.
                        </p>
                        <Link href={`/${slug}/billing/upgrade`}>
                          <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0 shadow-md shadow-red-500/20 rounded-lg font-semibold">
                            Zwiększ Plan Teraz →
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border mt-4">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Brak danych o zużyciu</p>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-8">

          {/* Payment Method */}
          <div className="rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xl p-6 sm:p-8 hover:border-border/80 transition-all duration-500">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <CardIcon className="h-5 w-5" />
              </div>
              Metoda Płatności
            </h2>

            {subscription?.paymentMethod ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-background/50 p-4 hover:shadow-md transition-shadow">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/50 border border-border shadow-sm">
                    <CardIcon className="h-6 w-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {subscription.paymentMethod.type === 'card' ? (
                        <>{subscription.paymentMethod.brand} •••• {subscription.paymentMethod.last4}</>
                      ) : subscription.paymentMethod.type === 'blik' ? (
                        'BLIK'
                      ) : (
                        'Przelew bankowy'
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      Aktywna i zweryfikowana
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground px-2 text-center">
                  Metoda zostanie automatycznie obciążona przy odnowieniu
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border bg-background/30 p-8 text-center transition-colors hover:bg-muted/30">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                  <CardIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">Brak zapisanej karty</h3>
                <p className="text-xs text-muted-foreground">
                  Zostaniesz poproszony o płatność w dniu odnowienia
                </p>
              </div>
            )}
          </div>

          {/* Przelewy24 System */}
          <div className="rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xl overflow-hidden hover:border-border/80 transition-all duration-500 group">
            <div className="relative border-b border-border/50 bg-muted/20 px-6 py-5 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
              <div className="relative flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Bezpieczne Transakcje
                  </h2>
                  <p className="text-muted-foreground text-xs mt-1 font-medium">Obsługiwane przez Przelewy24</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-background border border-border shadow-inner px-5 py-3 group-hover:shadow-md transition-shadow">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-sm">
                    <span className="text-white text-sm font-black">P</span>
                  </div>
                  <span className="font-extrabold text-foreground text-lg tracking-tight">Przelewy<span className="text-red-600">24</span></span>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Aktywne</Badge>
              </div>

              <div>
                <p className="text-[10px] font-bold text-muted-foreground mb-3 uppercase tracking-wider text-center">Obsługiwane Systemy</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Karta', icon: '💳' },
                    { label: 'BLIK', icon: '📱' },
                    { label: 'Przelew', icon: '🏦' },
                  ].map((method) => (
                    <div
                      key={method.label}
                      className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/50 py-3 px-2 hover:bg-muted/50 transition-colors shadow-sm"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">{method.icon}</span>
                      <span className="text-xs text-foreground font-semibold">{method.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                <p className="text-xs text-muted-foreground flex items-start gap-2 leading-relaxed">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-500" />
                  Płatności obsługiwane przez Przelewy24. Bezpieczne transakcje kartą, BLIK-iem i przelewem bankowym.
                </p>
              </div>
            </div>
          </div>

          {/* Info card */}
          <div className="rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl shadow-xl p-6 sm:p-8 hover:border-border/80 transition-all duration-500">
            <h2 className="text-sm font-bold text-foreground mb-4 tracking-wide uppercase">Warto Wiedzieć</h2>
            <div className="space-y-4">
              {[
                { icon: Shield, text: 'Płatności bankowe szyfrowane 256-bit SSL' },
                { icon: CheckCircle, text: 'Faktury VAT (23%) generowane automatycznie' },
                { icon: Calendar, text: 'Możliwość anulowania w każdej chwili' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <div className="p-1.5 rounded-lg bg-border/50 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-foreground" />
                  </div>
                  <span className="font-medium leading-relaxed">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border/50">
              <Link href={`/${slug}/billing/invoices`}>
                <Button variant="secondary" className="w-full text-foreground hover:bg-muted font-bold rounded-xl gap-2 h-11">
                  <FileText className="h-4 w-4" />
                  Historia Faktur
                </Button>
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
