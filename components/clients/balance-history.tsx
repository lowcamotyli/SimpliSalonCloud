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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TransactionType = 'deposit' | 'debit' | 'refund'

interface BalanceTransaction {
  id: string
  amount: number
  type: TransactionType
  description: string | null
  created_at: string
  created_by: string | null
}

interface BalanceHistoryProps {
  clientId: string
}

const PAGE_SIZE = 20

const typeLabelMap: Record<TransactionType, string> = {
  deposit: 'Doładowanie',
  debit: 'Pobranie',
  refund: 'Zwrot',
}

const typeBadgeClassMap: Record<TransactionType, string> = {
  deposit: 'bg-green-500 hover:bg-green-600',
  debit: 'bg-red-500 hover:bg-red-600',
  refund: 'bg-blue-500 hover:bg-blue-600',
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' zł'
}

export function BalanceHistory({ clientId }: BalanceHistoryProps) {
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    let cancelled = false

    const loadTransactions = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/clients/${clientId}/balance`)
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.error || 'Nie udało się pobrać historii transakcji')
        }

        if (!cancelled) {
          setTransactions(Array.isArray(payload?.transactions) ? payload.transactions : [])
        }
      } catch {
        if (!cancelled) {
          setTransactions([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadTransactions()

    return () => {
      cancelled = true
    }
  }, [clientId])

  const visibleTransactions = transactions.slice(0, visibleCount)
  const hasMore = visibleCount < transactions.length

  return (
    <Card id="client-balance-history">
      <CardHeader>
        <CardTitle>Historia transakcji</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : visibleTransactions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Brak transakcji salda dla tego klienta.
          </p>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Opis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {new Date(transaction.created_at).toLocaleString('pl-PL')}
                    </TableCell>
                    <TableCell>
                      <Badge className={typeBadgeClassMap[transaction.type]}>
                        {typeLabelMap[transaction.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(Number(transaction.amount))}
                    </TableCell>
                    <TableCell>{transaction.description || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {hasMore ? (
              <Button
                variant="outline"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Załaduj więcej
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
