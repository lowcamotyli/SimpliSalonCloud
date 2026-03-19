'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Dodatki do usługi</h3>

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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{addon.name}</span>
                  <Badge variant="secondary">+{addon.duration_delta}min</Badge>
                  <Badge variant="outline">+PLN {addon.price_delta.toFixed(2)}</Badge>
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
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_140px_140px_auto]">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nazwa dodatku (np. Maska nawilżająca)"
          disabled={saving}
        />
        <Input
          type="number"
          value={durationDelta}
          onChange={(event) => setDurationDelta(event.target.value)}
          placeholder="Czas dodatkowy (min)"
          disabled={saving}
        />
        <Input
          type="number"
          step="0.01"
          value={priceDelta}
          onChange={(event) => setPriceDelta(event.target.value)}
          placeholder="Dopłata (PLN)"
          disabled={saving}
        />
        <Button type="button" disabled={saving} onClick={() => void handleCreateAddon()}>
          {saving ? 'Dodawanie...' : 'Dodaj'}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
