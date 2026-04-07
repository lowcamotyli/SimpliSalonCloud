'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type CartService = {
  id: string
  name: string
  price: number
  duration: number
}

type CartEmployee = {
  id: string
  name: string
}

type CartAddon = {
  id: string
  name: string
  price_delta: number
  duration_delta: number
}

export interface CartItemProps {
  index: number
  service: CartService | null
  employee: CartEmployee | null
  addons: CartAddon[]
  selectedAddonIds: string[]
  onAddonSelect?: (addonId: string | null) => void
  startTime: string
  warnings?: string[]
  isCheckingAvailability?: boolean
  onRemove: () => void
  onChange: (
    updates: Partial<{
      serviceId: string | null
      employeeId: string | null
      startTime: string
      selectedAddonIds: string[]
    }>
  ) => void
}

const currencyFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
})

export function BookingCartItem({
  index,
  service,
  employee,
  addons,
  selectedAddonIds,
  onAddonSelect,
  startTime,
  warnings = [],
  isCheckingAvailability = false,
  onRemove,
}: CartItemProps) {
  const selectedAddons = addons.filter((addon) => selectedAddonIds.includes(addon.id))
  const totalAddonDuration = selectedAddons.reduce((sum, addon) => sum + addon.duration_delta, 0)
  const subtotal = (service?.price ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.price_delta, 0)

  return (
    <Card className="border-border/60 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {service?.name ?? 'Nie wybrano uslugi'}
              </p>
              <Badge variant="secondary">Rezerwacja {index + 1}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Pracownik: {employee?.name ?? 'Nie wybrano pracownika'}
            </p>
            <p className="text-sm text-muted-foreground">
              Start: {startTime || 'Nie ustawiono godziny'}
            </p>
          </div>

          {index > 0 ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-sm font-medium text-destructive transition-colors hover:text-destructive/80"
            >
              Usuń
            </button>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Dodatki
          </p>
          {selectedAddons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedAddons.map((addon) => (
                <Badge key={addon.id} variant="outline" className="gap-1">
                  <span>{addon.name}</span>
                  <span>
                    {addon.price_delta >= 0 ? '+' : ''}
                    {currencyFormatter.format(addon.price_delta)}
                  </span>
                </Badge>
              ))}
            </div>
          ) : null}
          {addons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {addons.map((addon) => {
                const isSelected = selectedAddonIds.includes(addon.id)
                const pricePreview =
                  addon.price_delta === 0
                    ? 'bez doplaty'
                    : `${addon.price_delta > 0 ? '+' : ''}${addon.price_delta} zl`

                return (
                  <button
                    key={addon.id}
                    type="button"
                    onClick={() => onAddonSelect?.(isSelected ? null : addon.id)}
                    aria-pressed={isSelected}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{addon.name}</span>
                    <span className="ml-1">{pricePreview}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak wybranych dodatkow</p>
          )}
        </div>

        {isCheckingAvailability || warnings.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            {isCheckingAvailability ? (
              <p className="text-sm text-amber-800">Sprawdzam dostepnosc terminu i sprzetu...</p>
            ) : null}
            {warnings.map((warning) => (
              <p key={warning} className="text-sm text-amber-900">
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm text-muted-foreground">
            Czas: {service ? service.duration : 0}
            {totalAddonDuration >= 0 ? '+' : ''}
            {totalAddonDuration} min
          </div>
          <div className="text-sm font-semibold text-foreground">
            Suma: {currencyFormatter.format(subtotal)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
