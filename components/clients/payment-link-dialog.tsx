"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

type PaymentType = "full" | "custom" | "topup"

type PaymentLinkDialogProps = {
  clientId: string
  bookingId?: string
  open: boolean
  onClose: () => void
}

const PAYMENT_OPTIONS: Array<{
  value: PaymentType
  title: string
  description: string
  requiresBooking?: boolean
}> = [
  {
    value: "full",
    title: "Pelna kwota wizyty",
    description: "Pobierz cala kwote przypisana do wizyty.",
    requiresBooking: true,
  },
  {
    value: "custom",
    title: "Wlasna kwota",
    description: "Wyslij link z recznie podana kwota.",
  },
  {
    value: "topup",
    title: "Doladowanie salda",
    description: "Dodaj srodki do salda klienta.",
  },
]

export function PaymentLinkDialog({
  clientId,
  bookingId,
  open,
  onClose,
}: PaymentLinkDialogProps) {
  const amountInputId = useId()
  const paymentUrlInputId = useId()
  const [type, setType] = useState<PaymentType>(bookingId ? "full" : "custom")
  const [amount, setAmount] = useState("")
  const [paymentUrl, setPaymentUrl] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)

  const availableOptions = useMemo(
    () => PAYMENT_OPTIONS.filter((option) => !option.requiresBooking || Boolean(bookingId)),
    [bookingId]
  )

  useEffect(() => {
    const nextDefaultType: PaymentType = bookingId ? "full" : "custom"
    setType(nextDefaultType)
    setAmount("")
    setPaymentUrl("")
    setError("")
    setSubmitting(false)
    setCopying(false)
    setCopied(false)
  }, [bookingId, open])

  const requiresAmount = type === "custom" || type === "topup"

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPaymentUrl("")
    setCopied(false)

    const normalizedAmount = amount.replace(",", ".").trim()
    const parsedAmount = normalizedAmount ? Number(normalizedAmount) : NaN

    if (requiresAmount && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setError("Kwota musi byc wieksza od 0.")
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch("/api/payments/booking/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          bookingId,
          amount: requiresAmount ? parsedAmount : undefined,
          type,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { paymentUrl?: string; error?: string }
        | null

      if (!response.ok || !payload?.paymentUrl) {
        throw new Error(payload?.error || "Nie udalo sie wygenerowac linku do platnosci.")
      }

      setPaymentUrl(payload.paymentUrl)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udalo sie wygenerowac linku do platnosci."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopy() {
    if (!paymentUrl) {
      return
    }

    setCopying(true)
    setCopied(false)

    try {
      await navigator.clipboard.writeText(paymentUrl)
      setCopied(true)
    } catch {
      setError("Nie udalo sie skopiowac linku.")
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Wygeneruj link do platnosci</DialogTitle>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <Label>Typ platnosci</Label>
            <RadioGroup value={type} onValueChange={(value) => setType(value as PaymentType)}>
              {availableOptions.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`payment-type-${option.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                >
                  <RadioGroupItem id={`payment-type-${option.value}`} value={option.value} />
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{option.title}</div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {requiresAmount && (
            <div className="space-y-2">
              <Label htmlFor={amountInputId}>Kwota</Label>
              <Input
                id={amountInputId}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={submitting}
                required={requiresAmount}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {paymentUrl && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor={paymentUrlInputId}>Link do platnosci</Label>
              <div className="flex gap-2">
                <Input id={paymentUrlInputId} value={paymentUrl} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={copying}
                >
                  {copied ? "Skopiowano" : "Kopiuj"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Anuluj
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generuj link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
