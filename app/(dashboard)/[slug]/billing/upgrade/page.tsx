'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Check,
  Loader2,
  Sparkles,
  Zap,
  Building2,
  Crown,
  ArrowLeft,
  Lock,
  Shield,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const PLANS = {
  starter: {
    name: 'Starter',
    monthlyPrice: 99,
    yearlyPrice: 990,
    description: 'Dla małych salonów i solo-preneurów',
    icon: Zap,
    gradient: 'from-muted-foreground/50 to-muted-foreground',
    highlight: 'border-muted-foreground/20',
    badge: null,
    features: [
      '2 pracowników',
      '100 rezerwacji/miesiąc',
      '50 klientów',
      'Podstawowy kalendarz',
      'Google Calendar',
      'PDF eksport',
      'Email powiadomienia',
    ],
    popular: false,
  },
  professional: {
    name: 'Professional',
    monthlyPrice: 299,
    yearlyPrice: 2990,
    description: 'Dla średnich salonów (3–10 stanowisk)',
    icon: Sparkles,
    gradient: 'from-primary to-primary/80',
    highlight: 'border-primary/50',
    badge: 'Najpopularniejszy',
    features: [
      '10 pracowników',
      'Nieograniczone rezerwacje',
      'Nieograniczona baza klientów',
      'Wszystko ze Starter',
      'Booksy integration',
      'SMS powiadomienia',
      'Zaawansowane analytics',
    ],
    popular: true,
  },
  business: {
    name: 'Business',
    monthlyPrice: 599,
    yearlyPrice: 5990,
    description: 'Dla sieci salonów i franczyz',
    icon: Building2,
    gradient: 'from-secondary to-secondary/80',
    highlight: 'border-secondary/50',
    badge: null,
    features: [
      'Nieograniczona liczba pracowników',
      'Multi-salon (3 lokalizacje)',
      'Wszystko z Professional',
      'API access',
      'Webhooks',
      'White-label',
      'Dedykowany manager',
    ],
    popular: false,
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 1500,
    yearlyPrice: 15000,
    description: 'Dla dużych sieci i korporacji',
    icon: Crown,
    gradient: 'from-accent to-accent/80',
    highlight: 'border-accent/50',
    badge: 'Dla sieci',
    features: [
      'Nieograniczone wszystko',
      'Wszystko z Business',
      'On-premise deployment',
      'Custom development',
      '24/7 support',
      'SLA 99.9%',
    ],
    popular: false,
  },
}

const FAQ = [
  {
    q: 'Czy mogę zmienić plan później?',
    a: 'Tak, możesz w każdej chwili zmienić plan na wyższy lub niższy. W przypadku upgrade otrzymasz proporcjonalną dopłatę za pozostały okres.',
  },
  {
    q: 'Czy mogę anulować subskrypcję?',
    a: 'Tak, możesz anulować subskrypcję w dowolnym momencie. Anulacja wejdzie w życie na koniec okresu rozliczeniowego.',
  },
  {
    q: 'Czy wystawiacie faktury VAT?',
    a: 'Tak, dla każdej płatności automatycznie generujemy fakturę VAT z 23% podatkiem.',
  },
  {
    q: 'Jakie metody płatności akceptujecie?',
    a: 'Akceptujemy płatności przez Przelewy24: karty kredytowe i debetowe, BLIK oraz przelewy bankowe.',
  },
]

type PlanType = keyof typeof PLANS
type BillingInterval = 'monthly' | 'yearly'

export default function UpgradePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [loading, setLoading] = useState<PlanType | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const { data: subscription } = useQuery({
    queryKey: ['subscription', slug],
    queryFn: async () => {
      const res = await fetch(`/api/subscriptions/${slug}`)
      if (!res.ok) return null
      return res.json()
    },
  })

  const currentPlan = subscription?.plan || 'starter'

  const handleSelectPlan = async (planType: PlanType) => {
    if (planType === currentPlan) {
      toast.info('To jest Twój obecny plan')
      return
    }
    setLoading(planType)

    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          billingInterval,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to create checkout')
      }

      const data = await res.json()

      if (data.requiresPayment && data.paymentUrl) {
        // Redirect do Przelewy24
        window.location.href = data.paymentUrl
      } else {
        // Trial activated - redirect to success page
        router.push(`/${slug}/billing/success`)
      }
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
      setLoading(null)
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-16 px-4 sm:px-0 space-y-10">

      {/* Back link + Header */}
      <div className="space-y-4">
        <Link
          href={`/${slug}/billing`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Powrót do subskrypcji
        </Link>

        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Wybierz plan idealny dla Twojego salonu
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Prosty, przejrzysty cennik
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Skaluj swój biznes z SimpliSalon. Bez ukrytych opłat, bez niespodzianek.
          </p>
        </div>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-xl border border-border">
          <button
            onClick={() => setBillingInterval('monthly')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${billingInterval === 'monthly'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Miesięcznie
          </button>
          <button
            onClick={() => setBillingInterval('yearly')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${billingInterval === 'yearly'
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Rocznie
            <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
              -16%
            </span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {(Object.keys(PLANS) as PlanType[]).map((planKey) => {
          const plan = PLANS[planKey]
          const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice
          const isCurrent = planKey === currentPlan
          const PlanIcon = plan.icon

          return (
            <div
              key={planKey}
              className={`relative flex flex-col rounded-2xl border-2 bg-card shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden ${isCurrent
                ? 'border-primary shadow-primary/20'
                : plan.popular
                  ? 'border-primary/50 shadow-primary/10'
                  : 'border-border hover:border-muted-foreground/30'
                }`}
            >
              {/* Top gradient bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${plan.gradient}`} />

              {/* Badge */}
              {(isCurrent || plan.badge) && (
                <div className="absolute top-4 right-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${isCurrent
                    ? 'bg-primary/10 text-primary'
                    : 'bg-primary/5 text-primary'
                    }`}>
                    {isCurrent ? '✓ Obecny plan' : plan.badge}
                  </span>
                </div>
              )}

              <div className="flex flex-col flex-1 p-6 space-y-5">
                {/* Plan header */}
                <div>
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${plan.gradient} mb-3`}>
                    <PlanIcon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-snug">{plan.description}</p>
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-foreground">{price}</span>
                    <span className="text-muted-foreground mb-1 text-sm">PLN</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    / {billingInterval === 'monthly' ? 'miesiąc' : 'rok'}
                    {billingInterval === 'yearly' && (
                      <span className="ml-1 text-primary font-medium">
                        ({Math.round(price / 12)} PLN/mies.)
                      </span>
                    )}
                  </p>
                </div>

                {/* CTA Button */}
                <Button
                  onClick={() => handleSelectPlan(planKey)}
                  disabled={loading !== null || isCurrent}
                  className={`w-full font-semibold transition-all duration-200 ${isCurrent
                    ? 'bg-muted text-muted-foreground border border-border hover:bg-muted/80 cursor-default'
                    : plan.popular
                      ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/20'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  variant={isCurrent ? 'outline' : 'default'}
                >
                  {loading === planKey ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Przetwarzanie...
                    </>
                  ) : isCurrent ? (
                    '✓ Obecny plan'
                  ) : (
                    'Wybierz plan'
                  )}
                </Button>

                {/* Features */}
                <div className="pt-4 border-t border-border space-y-2.5 flex-1">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-2.5 text-sm">
                      <div className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${plan.gradient}`}>
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      </div>
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Przelewy24 Payment Placeholder */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary-foreground flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Bezpieczna Bramka Płatności
              </h2>
              <p className="text-primary-foreground/80 text-sm mt-0.5">
                Wszystkie transakcje szyfrowane SSL/TLS
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-background/10 border border-background/20 px-4 py-2">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">P</span>
              </div>
              <span className="text-primary-foreground font-bold text-sm">Przelewy24</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Payment methods */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Metody płatności
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Karta', emoji: '💳', desc: 'Visa, MC' },
                  { label: 'BLIK', emoji: '📱', desc: 'Instant' },
                  { label: 'Przelew', emoji: '🏦', desc: 'Bankowy' },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/50 py-3 px-2 text-center"
                  >
                    <span className="text-2xl">{m.emoji}</span>
                    <span className="text-xs font-semibold text-foreground">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Security badges */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Bezpieczeństwo
              </p>
              <div className="space-y-2">
                {[
                  { icon: Shield, text: 'Szyfrowanie SSL/TLS 256-bit' },
                  { icon: Lock, text: 'PCI DSS Level 1 Compliant' },
                  { icon: Check, text: '3D Secure 2.0' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Status integracji
              </p>
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/20">
                    <Loader2 className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">W przygotowaniu</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Integracja z Przelewy24 zostanie aktywowana wkrótce. Logika płatności zostanie podłączona w kolejnym etapie.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold text-center text-foreground">Często zadawane pytania</h2>
        <div className="space-y-2">
          {FAQ.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-foreground text-sm">{item.q}</span>
                {openFaq === index ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>
              {openFaq === index && (
                <div className="px-5 pb-4 text-sm text-muted-foreground border-t border-border pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
