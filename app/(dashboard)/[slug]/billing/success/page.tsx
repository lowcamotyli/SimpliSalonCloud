'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Sparkles, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import confetti from 'canvas-confetti'

type PaymentUiStatus = 'loading' | 'paid' | 'pending' | 'error'

function launchConfetti() {
  const duration = 3 * 1000
  const animationEnd = Date.now() + duration
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }
  const random = (min: number, max: number) => Math.random() * (max - min) + min

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now()
    if (timeLeft <= 0) {
      window.clearInterval(interval)
      return
    }

    const particleCount = 50 * (timeLeft / duration)
    confetti({ ...defaults, particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } })
    confetti({ ...defaults, particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } })
  }, 250)
}

export default function BillingSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params?.slug as string
  const sessionId = searchParams.get('session')
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<PaymentUiStatus>('loading')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setStatus('error')
      return
    }

    let cancelled = false
    let pollTimeout: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const maxAttempts = 6

    const checkStatus = async () => {
      attempts += 1

      try {
        const response = await fetch(`/api/payments/status?session=${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Status check failed')
        }

        const data = (await response.json()) as { status?: string }
        const nextStatus = data?.status

        if (cancelled) return

        if (nextStatus === 'paid') {
          setStatus('paid')
          launchConfetti()
          return
        }

        if (nextStatus === 'pending' && attempts < maxAttempts) {
          setStatus('pending')
          pollTimeout = setTimeout(checkStatus, 2500)
          return
        }

        setStatus(nextStatus === 'pending' ? 'pending' : 'error')
      } catch {
        if (!cancelled) {
          setStatus('error')
        }
      }
    }

    checkStatus()

    return () => {
      cancelled = true
      if (pollTimeout) {
        clearTimeout(pollTimeout)
      }
    }
  }, [sessionId])

  const content = useMemo(() => {
    if (status === 'paid') {
      return {
        title: 'Platnosc zakonczona!',
        description: 'Twoja subskrypcja zostala pomyslnie aktywowana.',
        helper: 'Potwierdzenie platnosci zostalo zapisane.',
      }
    }

    if (status === 'pending' || status === 'loading') {
      return {
        title: 'Przetwarzamy platnosc',
        description: 'Czekamy na potwierdzenie z Przelewy24. Odswiezymy status automatycznie.',
        helper: 'Zwykle trwa to kilka sekund.',
      }
    }

    return {
      title: 'Nie mozna potwierdzic platnosci',
      description: 'Nie otrzymalismy jeszcze poprawnego potwierdzenia transakcji.',
      helper: 'Sprawdz szczegoly subskrypcji lub sproboj ponownie za chwile.',
    }
  }, [status])

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-[80vh]">
      <div
        className={`relative w-full max-w-lg transition-all duration-700 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-primary/30 to-primary/50 rounded-2xl blur opacity-25 animate-pulse" />

        <Card className="relative overflow-hidden border-border bg-card shadow-xl rounded-2xl">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />

          <div className="p-8 sm:p-12 text-center space-y-8">
            <div className="relative mx-auto h-24 w-24">
              {status === 'paid' && (
                <>
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-25" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 shadow-inner">
                    <Check className="h-12 w-12 text-primary drop-shadow-sm" strokeWidth={3} />
                  </div>
                  <div className="absolute -top-2 -right-2 bg-card rounded-full p-1.5 shadow-md border border-border">
                    <Sparkles className="h-5 w-5 text-amber-400 fill-amber-400" />
                  </div>
                </>
              )}

              {(status === 'pending' || status === 'loading') && (
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 shadow-inner">
                  <Loader2 className="h-12 w-12 text-amber-600 animate-spin" strokeWidth={2.5} />
                </div>
              )}

              {status === 'error' && (
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10 border border-destructive/20 shadow-inner">
                  <AlertCircle className="h-12 w-12 text-destructive" strokeWidth={2.5} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">{content.title}</h1>
              <p className="text-muted-foreground text-lg leading-relaxed">{content.description}</p>
            </div>

            <div className="bg-muted/30 rounded-2xl p-4 border border-border flex items-center gap-3 text-left">
              <ShieldCheck className="h-10 w-10 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">Status transakcji</p>
                <p className="text-muted-foreground text-xs">{content.helper}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href={`/${slug}/billing`} className="w-full sm:w-auto">
                <Button variant="outline" className="w-full h-11 border-border hover:bg-muted hover:text-foreground">
                  Szczegoly subskrypcji
                </Button>
              </Link>
              <Link href={`/${slug}/dashboard`} className="w-full sm:w-auto">
                <Button className="w-full h-11 bg-primary text-primary-foreground">
                  Przejdz do dashboardu
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">W razie pytan skontaktuj sie z naszym wsparciem.</p>
      </div>
    </div>
  )
}
