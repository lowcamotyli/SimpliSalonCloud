'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

type SegmentCriteria = {
  tags?: string[]
}

type PremiumSlot = {
  id: string
  name: string
  date: string
  start_time: string
  end_time: string
  price_modifier: number | null
  requires_prepayment: boolean
  segment_criteria: SegmentCriteria | null
  created_at: string
}

type PremiumSlotsResponse = {
  data?: PremiumSlot[]
  slots?: PremiumSlot[]
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const error = (payload as { error?: unknown }).error
      if (typeof error === 'string' && error.length > 0) {
        return error
      }
    }
  } catch {
    return 'Wystąpił błąd żądania.'
  }

  return 'Wystąpił błąd żądania.'
}

function formatPriceModifier(modifier: number | null): string {
  if (modifier === null) {
    return 'Brak mnożnika'
  }

  const percentage = Math.round((modifier - 1) * 100)
  if (percentage > 0) {
    return `+${percentage}%`
  }

  return `${percentage}%`
}

export default function PremiumHoursPage(): JSX.Element {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [slots, setSlots] = useState<PremiumSlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [priceModifier, setPriceModifier] = useState('')
  const [requiresPrepayment, setRequiresPrepayment] = useState(false)
  const [tagsInput, setTagsInput] = useState('')

  const apiBase = useMemo(() => {
    const query = slug ? `?slug=${encodeURIComponent(slug)}` : ''
    return `/api/premium-slots${query}`
  }, [slug])

  const loadSlots = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(apiBase, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const payload: PremiumSlotsResponse | PremiumSlot[] = await response.json()
      if (Array.isArray(payload)) {
        setSlots(payload)
      } else if (Array.isArray(payload.data)) {
        setSlots(payload.data)
      } else {
        setSlots(payload.slots ?? [])
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Nie udało się pobrać premium godzin.'
      setError(message)
      setSlots([])
    } finally {
      setIsLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  const handleCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    const payload = {
      name,
      date,
      start_time: startTime,
      end_time: endTime,
      price_modifier: priceModifier.length > 0 ? Number(priceModifier) : null,
      requires_prepayment: requiresPrepayment,
      segment_criteria: tags.length > 0 ? { tags } : null,
    }

    try {
      const response = await fetch(apiBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      setName('')
      setDate('')
      setStartTime('')
      setEndTime('')
      setPriceModifier('')
      setRequiresPrepayment(false)
      setTagsInput('')

      await loadSlots()
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Nie udało się utworzyć premium godziny.'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/premium-slots/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      setSlots(previous => previous.filter(slot => slot.id !== id))
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Nie udało się usunąć premium godziny.'
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Premium godziny</h1>
        <p className="text-muted-foreground">Zarządzaj specjalnymi przedziałami czasowymi i dodatkowymi warunkami rezerwacji.</p>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dodaj premium slot</CardTitle>
          <CardDescription>Ustaw datę, przedział godzin i opcjonalne warunki dla wybranych klientów.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nazwa</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="Np. Wieczór VIP"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_time">Godzina od</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={event => setStartTime(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time">Godzina do</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={event => setEndTime(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="price_modifier">Mnożnik ceny (np. 1.5 = +50%)</Label>
                <Input
                  id="price_modifier"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceModifier}
                  onChange={event => setPriceModifier(event.target.value)}
                  placeholder="Np. 1.5"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="tags">Tylko dla klientów z tagami (opcjonalnie)</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={event => setTagsInput(event.target.value)}
                  placeholder="Np. vip, stali-klienci"
                />
                <p className="text-xs text-muted-foreground">Wpisz tagi oddzielone przecinkami.</p>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="requires_prepayment"
                    checked={requiresPrepayment}
                    onCheckedChange={checked => setRequiresPrepayment(checked === true)}
                  />
                  <Label htmlFor="requires_prepayment">Wymagaj przedpłaty</Label>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Zapisywanie...' : 'Dodaj slot'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista premium slotów</CardTitle>
          <CardDescription>Aktywne specjalne przedziały czasowe dla salonu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Ładowanie...</p>
          ) : null}

          {!isLoading && slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak premium slotów.</p>
          ) : null}

          {!isLoading
            ? slots.map(slot => {
                const tags = Array.isArray(slot.segment_criteria?.tags)
                  ? slot.segment_criteria?.tags.filter(tag => typeof tag === 'string')
                  : []

                return (
                  <div
                    key={slot.id}
                    className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{slot.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {slot.date} • {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formatPriceModifier(slot.price_modifier)}</Badge>
                        {slot.requires_prepayment ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Wymagana przedpłata</Badge>
                        ) : (
                          <Badge variant="secondary">Bez przedpłaty</Badge>
                        )}
                        {tags.map(tag => (
                          <Badge key={`${slot.id}-${tag}`} variant="secondary">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDelete(slot.id)}
                      disabled={deletingId === slot.id}
                    >
                      {deletingId === slot.id ? 'Usuwanie...' : 'Usuń'}
                    </Button>
                  </div>
                )
              })
            : null}
        </CardContent>
      </Card>
    </div>
  )
}
