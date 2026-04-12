'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Tables } from '@/types/supabase'

type AddonTemplate = Tables<'addon_templates'>

interface AddonTemplatesResponse {
  templates?: AddonTemplate[]
}

export default function AddonTemplatesPage() {
  const [templates, setTemplates] = useState<AddonTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [priceDelta, setPriceDelta] = useState('0')
  const [durationDelta, setDurationDelta] = useState('0')

  const fetchTemplates = useCallback(async (): Promise<void> => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/addon-templates', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udało się pobrać szablonów dodatków')
      }

      const data = (await response.json()) as AddonTemplatesResponse
      setTemplates(data.templates ?? [])
    } catch {
      toast.error('Nie udało się pobrać szablonów dodatków')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const handleCreate = async (): Promise<void> => {
    const trimmedName = name.trim()
    const parsedPriceDelta = Number(priceDelta)
    const parsedDurationDelta = Number(durationDelta)

    if (!trimmedName) {
      toast.error('Nazwa jest wymagana')
      return
    }

    if (!Number.isFinite(parsedPriceDelta)) {
      toast.error('Zmiana ceny musi być liczbą')
      return
    }

    if (!Number.isInteger(parsedDurationDelta)) {
      toast.error('Zmiana czasu musi być liczbą całkowitą')
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch('/api/addon-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          price_delta: parsedPriceDelta,
          duration_delta: parsedDurationDelta,
        }),
      })

      if (!response.ok) {
        throw new Error('Nie udało się utworzyć szablonu dodatku')
      }

      setName('')
      setPriceDelta('0')
      setDurationDelta('0')
      toast.success('Szablon dodatku został utworzony')
      await fetchTemplates()
    } catch {
      toast.error('Nie udało się utworzyć szablonu dodatku')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id)

    try {
      const response = await fetch(`/api/addon-templates/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Nie udało się usunąć szablonu dodatku')
      }

      toast.success('Szablon dodatku został usunięty')
      await fetchTemplates()
    } catch {
      toast.error('Nie udało się usunąć szablonu dodatku')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Szablony Dodatków</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nowy szablon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="np. Maska kolagenowa"
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_delta">Zmiana ceny (PLN)</Label>
              <Input
                id="price_delta"
                type="number"
                step="0.01"
                value={priceDelta}
                onChange={(event) => setPriceDelta(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_delta">Zmiana czasu (min)</Label>
              <Input
                id="duration_delta"
                type="number"
                step="1"
                value={durationDelta}
                onChange={(event) => setDurationDelta(event.target.value)}
                disabled={isCreating}
              />
            </div>
          </div>
          <Button onClick={() => void handleCreate()} disabled={isCreating}>
            {isCreating ? 'Zapisywanie...' : 'Dodaj szablon'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista szablonów</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Ładowanie...</p> : null}
          {!isLoading && templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak szablonów dodatków.</p>
          ) : null}
          {!isLoading && templates.length > 0 ? (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {Number(template.price_delta).toFixed(2)} PLN · {template.duration_delta} min
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete(template.id)}
                    disabled={deletingId === template.id || isCreating}
                  >
                    {deletingId === template.id ? 'Usuwanie...' : 'Usuń'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
