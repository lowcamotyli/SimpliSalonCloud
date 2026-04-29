'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type SmsWalletResponse = {
  balance: number
}

type TopupResponse = {
  redirectUrl: string
}

const TOPUP_PACKAGES = [
  { packageSize: 100, priceLabel: '15 PLN' },
  { packageSize: 500, priceLabel: '65 PLN' },
  { packageSize: 1000, priceLabel: '120 PLN' },
] as const

export default function SmsWalletCard() {
  const params = useParams()
  const slug = params?.slug as string
  const [balance, setBalance] = useState<number | null>(null)
  const [isTopupLoading, setIsTopupLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading: isBalanceLoading,
    isFetching,
  } = useQuery<SmsWalletResponse>({
    queryKey: ['sms-wallet', slug],
    queryFn: async () => {
      const res = await fetch('/api/billing/sms-wallet', { method: 'GET' })
      if (!res.ok) throw new Error('Failed to fetch SMS wallet balance')
      return res.json()
    },
    enabled: Boolean(slug),
  })

  useEffect(() => {
    if (typeof data?.balance === 'number') {
      setBalance(data.balance)
    }
  }, [data])

  const isBusy = isBalanceLoading || isFetching || isTopupLoading !== null

  const displayedBalance = useMemo(() => {
    if (typeof balance === 'number') return balance
    if (typeof data?.balance === 'number') return data.balance
    return 0
  }, [balance, data])

  const handleTopup = async (packageSize: number) => {
    setError(null)
    setIsTopupLoading(packageSize)

    try {
      const res = await fetch('/api/billing/sms-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageSize }),
      })

      if (!res.ok) {
        throw new Error('Failed to create SMS top-up payment')
      }

      const payload = (await res.json()) as TopupResponse

      if (!payload?.redirectUrl) {
        throw new Error('Missing redirect URL in top-up response')
      }

      window.location.href = payload.redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed')
      setIsTopupLoading(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card  shadow-xl p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Portfel SMS
          </h2>
          <p className="text-sm text-muted-foreground">Doładowania SMS dla Twojego salonu</p>
        </div>
        <Badge variant="secondary" className="font-semibold">
          Saldo: {displayedBalance} SMS
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TOPUP_PACKAGES.map((pkg) => {
          const loadingThis = isTopupLoading === pkg.packageSize

          return (
            <Button
              key={pkg.packageSize}
              type="button"
              variant="outline"
              className="h-auto py-3 px-4 rounded-full bg-background/70"
              disabled={isBusy}
              onClick={() => handleTopup(pkg.packageSize)}
            >
              <span className="flex flex-col items-start text-left leading-tight">
                <span className="text-sm font-semibold">{pkg.packageSize} SMS</span>
                <span className="text-xs text-muted-foreground">{pkg.priceLabel}</span>
              </span>
              {loadingThis ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            </Button>
          )
        })}
      </div>

      {isBalanceLoading ? (
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Pobieranie salda SMS...
        </p>
      ) : null}

      {error ? <p className="mt-4 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
