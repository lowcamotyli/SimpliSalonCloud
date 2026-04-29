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
    className: 'border-[var(--v3-border)] bg-[var(--v3-bg-alt)] text-[var(--v3-text-secondary)]',
  },
  pending: {
    label: 'Oczekuje na płatność',
    className: 'border-[#E9D6A8] bg-[var(--v3-gold-soft)] text-[var(--v3-gold)]',
  },
  paid: {
    label: 'Opłacono',
    className: 'border-[var(--v3-success)] bg-[var(--v3-success-bg)] text-[var(--v3-success)]',
  },
  failed: {
    label: 'Płatność nieudana',
    variant: 'destructive',
  },
  refunded: {
    label: 'Zwrócono',
    className: 'border-[var(--v3-secondary)] bg-[var(--v3-secondary-soft)] text-[var(--v3-secondary)]',
  },
  cancelled: {
    label: 'Anulowano',
    variant: 'secondary',
    className: 'border-[var(--v3-border)] bg-[var(--v3-bg-alt)] text-[var(--v3-text-secondary)]',
  },
}

export function PaymentStatusBadge({ status, amount }: PaymentStatusBadgeProps) {
  const { label, variant, className } = config[status]
  const text =
    status === 'paid' && typeof amount === 'number'
      ? `${label} ${amount.toFixed(2)} zł`
      : label

  return (
    <Badge
      variant={variant}
      className={`rounded-[var(--v3-r-pill)] px-2.5 py-0.5 font-ui text-xs font-semibold ${className ?? ''}`}
    >
      {text}
    </Badge>
  )
}
