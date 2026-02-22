'use client'

import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'

export default function BillingSuccessPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const duration = 3 * 1000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

    const random = (min: number, max: number) => Math.random() * (max - min) + min

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)

      confetti({
        ...defaults,
        particleCount,
        origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 },
      })
      confetti({
        ...defaults,
        particleCount,
        origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 },
      })
    }, 250)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-[80vh]">
      <div
        className={`relative w-full max-w-lg transition-all duration-700 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}
      >
        {/* Decorative background glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-primary/30 to-primary/50 rounded-2xl blur opacity-25 animate-pulse" />

        <Card className="relative overflow-hidden border-border bg-card shadow-xl rounded-xl">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />

          <div className="p-8 sm:p-12 text-center space-y-8">
            <div className="relative mx-auto h-24 w-24">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-25" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 shadow-inner">
                <Check className="h-12 w-12 text-primary drop-shadow-sm" strokeWidth={3} />
              </div>
              <div className="absolute -top-2 -right-2 bg-card rounded-full p-1.5 shadow-md border border-border">
                <Sparkles className="h-5 w-5 text-amber-400 fill-amber-400" />
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Płatność zakończona!
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Twoja subskrypcja została pomyślnie aktywowana. <br className="hidden sm:block" />
                Dziękujemy za zaufanie!
              </p>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-center gap-3 text-left">
              <ShieldCheck className="h-10 w-10 text-primary flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground text-sm">Bezpieczna transakcja</p>
                <p className="text-muted-foreground text-xs">Potwierdzenie płatności zostało wysłane na Twój adres email.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href={`/${slug}/billing`} className="w-full sm:w-auto">
                <Button variant="outline" className="w-full h-11 border-border hover:bg-muted hover:text-foreground">
                  Szczegóły subskrypcji
                </Button>
              </Link>
              <Link href={`/${slug}/dashboard`} className="w-full sm:w-auto">
                <Button className="w-full h-11 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg shadow-primary/20">
                  Przejdź do dashboardu
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          W razie pytań skontaktuj się z naszym wsparciem.
        </p>
      </div>
    </div>
  )
}
