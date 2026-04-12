'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TransactionType = 'deposit' | 'debit' | 'refund'

interface BalanceTransactionDialogProps {
  clientId: string
  type: TransactionType
  currentBalance: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const dialogConfig: Record<TransactionType, { title: string; submitLabel: string }> = {
  deposit: { title: 'Doładuj saldo', submitLabel: 'Doładuj' },
  debit: { title: 'Pobierz z salda', submitLabel: 'Pobierz' },
  refund: { title: 'Zwrot na saldo', submitLabel: 'Zwróć' },
}

export function BalanceTransactionDialog({
  clientId,
  type,
  currentBalance,
  open,
  onClose,
  onSuccess,
}: BalanceTransactionDialogProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setAmount('')
      setDescription('')
      setSubmitting(false)
    }
  }, [open, type])

  const handleSubmit = async () => {
    const parsedAmount = Number(amount.replace(',', '.'))

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Kwota musi być większa od 0')
      return
    }

    if (type === 'debit' && parsedAmount > currentBalance) {
      toast.error('Kwota nie może przekraczać dostępnego salda')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(`/api/clients/${clientId}/balance/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parsedAmount,
          description: description.trim() || undefined,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Nie udało się zapisać transakcji')
      }

      toast.success('Transakcja została zapisana')
      onSuccess()
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się zapisać transakcji'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const { title, submitLabel } = dialogConfig[type]

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="balance-amount">Kwota</Label>
            <Input
              id="balance-amount"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance-description">Opis</Label>
            <Textarea
              id="balance-description"
              placeholder="Opcjonalny opis transakcji"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Anuluj
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
