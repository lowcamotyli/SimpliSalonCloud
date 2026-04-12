'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useCurrentRole } from '@/hooks/use-current-role'
import { BalanceHistory } from './balance-history'
import { BalanceTransactionDialog } from './balance-transaction-dialog'

type DialogType = 'deposit' | 'debit' | 'refund'

interface ClientBalanceCardProps {
  clientId: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' zł'
}

export function ClientBalanceCard({ clientId }: ClientBalanceCardProps) {
  const { currentRole } = useCurrentRole()
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<DialogType>('deposit')
  const [historyVisible, setHistoryVisible] = useState(false)

  const canManageBalance = currentRole === 'owner' || currentRole === 'manager'

  const fetchBalance = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${clientId}/balance`)
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Nie udało się pobrać salda')
      }

      setBalance(Number(payload?.balance) || 0)
    } catch {
      setBalance(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchBalance()
  }, [clientId])

  const handleOpenDialog = (type: DialogType) => {
    setDialogType(type)
    setDialogOpen(true)
  }

  const handleShowHistory = () => {
    setHistoryVisible(true)
    window.requestAnimationFrame(() => {
      document.getElementById('client-balance-history')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Saldo klienta</CardTitle>
            <Badge variant="secondary">Portfel klienta</Badge>
          </div>
          {canManageBalance ? (
            <div className="flex gap-2">
              <Button onClick={() => handleOpenDialog('deposit')}>Doładuj</Button>
              <Button variant="outline" onClick={() => handleOpenDialog('debit')}>
                Pobierz
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-3xl font-semibold tracking-tight">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : formatCurrency(balance)}
          </div>
          <button
            type="button"
            onClick={handleShowHistory}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Historia transakcji
          </button>
        </CardContent>
      </Card>

      <BalanceTransactionDialog
        clientId={clientId}
        type={dialogType}
        currentBalance={balance}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          setHistoryVisible(true)
          void fetchBalance()
        }}
      />

      {historyVisible ? <BalanceHistory clientId={clientId} /> : null}
    </div>
  )
}
