import { Badge } from '@/components/ui/badge'

type PaymentStatus = 'none' | 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

interface PaymentStatusBadgeProps {
  status: PaymentStatus
  amount?: number
}

const config: Record<
  PaymentStatus,
  {
    label: string
    variant?: 'secondary' | 'destructive'
    className?: string
  }
> = {
  none: {
    label: 'Brak płatności',
    variant: 'secondary',
  },
  pending: {
    label: 'Oczekuje na płatność',
    className: 'bg-yellow-100 text-yellow-800',
  },
  paid: {
    label: 'Opłacono',
    className: 'bg-green-100 text-green-800',
  },
  failed: {
    label: 'Płatność nieudana',
    variant: 'destructive',
  },
  refunded: {
    label: 'Zwrócono',
    className: 'bg-blue-100 text-blue-800',
  },
  cancelled: {
    label: 'Anulowano',
    variant: 'secondary',
  },
}

export function PaymentStatusBadge({ status, amount }: PaymentStatusBadgeProps) {
  const { label, variant, className } = config[status]
  const text =
    status === 'paid' && typeof amount === 'number'
      ? `${label} ${amount.toFixed(2)} zł`
      : label

  return (
    <Badge variant={variant} className={className}>
      {text}
    </Badge>
  )
}
