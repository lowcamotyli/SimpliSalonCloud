'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Addon = {
  id: string
  name: string
  duration_delta: number
  price_delta: number
}

type AddonsEditorProps = {
  serviceId: string
  salonId: string
}

export function AddonsEditor({ serviceId, salonId }: AddonsEditorProps) {
  const [addons, setAddons] = useState<Addon[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [durationDelta, setDurationDelta] = useState('0')
  const [priceDelta, setPriceDelta] = useState('0')

  const formatNumber = (value: number) => {
    const fixed = value.toFixed(2)
    return fixed.replace(/\.?0+$/, '')
  }

  const getAddonPreview = (addon: Addon) => {
    const priceText =
      addon.price_delta > 0
        ? `+${formatNumber(addon.price_delta)} zł`
        : addon.price_delta < 0
          ? `-${formatNumber(Math.abs(addon.price_delta))} zł rabat`
          : 'bez dopłaty'

    if (addon.duration_delta > 0) {
      return `${priceText} · +${addon.duration_delta} min`
    }

    return priceText
  }

  const fetchAddons = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/services/${serviceId}/addons`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Failed to load add-ons')
      }

      const data = (await response.json()) as { addons?: Addon[] }
      setAddons(data.addons ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load add-ons'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [serviceId, salonId])

  useEffect(() => {
    void fetchAddons()
  }, [fetchAddons])

  const handleCreateAddon = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Nazwa dodatku jest wymagana')
      return
    }

    const parsedDuration = Number(durationDelta)
    const parsedPrice = Number(priceDelta)

    if (!Number.isInteger(parsedDuration)) {
      setError('Czas trwania musi być liczbą całkowitą')
      return
    }

    if (parsedDuration < 0) {
      setError('Dodatkowy czas nie może być ujemny')
      return
    }

    if (!Number.isFinite(parsedPrice)) {
      setError('Cena musi być prawidłową liczbą')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/services/${serviceId}/addons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          duration_delta: parsedDuration,
          price_delta: parsedPrice,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create add-on')
      }

      setName('')
      setDurationDelta('0')
      setPriceDelta('0')

      await fetchAddons()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create add-on'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAddon = async (addonId: string) => {
    setDeletingId(addonId)
    setError(null)

    try {
      const response = await fetch(`/api/services/${serviceId}/addons?addonId=${encodeURIComponent(addonId)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete add-on')
      }

      await fetchAddons()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete add-on'
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4" data-salon-id={salonId}>
      <section className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Dodatki do usługi</h3>
          <p className="text-xs text-muted-foreground">Lista dodatków aktualnie przypisanych do tej usługi.</p>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Ładowanie...</p> : null}

        {!loading && addons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak skonfigurowanych dodatków.</p>
        ) : null}

        {!loading && addons.length > 0 ? (
          <div className="space-y-2">
            {addons.map((addon) => (
              <div
                key={addon.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="space-y-1">
                  <span className="text-sm font-medium">{addon.name}</span>
                  <p className="text-xs text-muted-foreground">{getAddonPreview(addon)}</p>
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDeleteAddon(addon.id)}
                  disabled={deletingId === addon.id || saving}
                >
                  {deletingId === addon.id ? 'Usuwanie...' : 'Usuń'}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Opcje dodatkowe</h3>
          <p className="text-sm text-muted-foreground">
            Klient może wybrać jedną opcję podczas rezerwacji. Opcja może modyfikować czas i cenę usługi.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="addon-name">Nazwa opcji</Label>
            <Input
              id="addon-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="np. Maska nawilżająca, Keratyna, Folia"
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="addon-duration-delta">Dodatkowy czas (min)</Label>
              <Input
                id="addon-duration-delta"
                type="number"
                value={durationDelta}
                onChange={(event) => setDurationDelta(event.target.value)}
                placeholder="0"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">0 = bez zmiany czasu.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="addon-price-delta">Zmiana ceny (zł)</Label>
              <Input
                id="addon-price-delta"
                type="number"
                step="0.01"
                value={priceDelta}
                onChange={(event) => setPriceDelta(event.target.value)}
                placeholder="0"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">0 = bez dopłaty. Ujemna = rabat.</p>
            </div>
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleCreateAddon()} className="w-full">
            {saving ? 'Dodawanie...' : 'Dodaj opcję'}
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
