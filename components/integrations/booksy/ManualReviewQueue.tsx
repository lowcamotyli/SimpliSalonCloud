'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CardContent } from '@/components/ui/card'
import { CardFooter } from '@/components/ui/card'
import { CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioGroupItem } from '@/components/ui/radio-group'

type ManualReviewCandidate = {
  id: string
  appointmentDate?: string
  startTime?: string
  clientName?: string | null
  serviceName?: string | null
  score?: number
}

type ManualReviewParsed = {
  clientName?: string
  serviceName?: string
  bookingDate?: string
  bookingTime?: string
  source?: string
}

type ManualReviewEvent = {
  id: string
  event_type: string
  review_reason: string | null
  review_detail: string | null
  candidate_bookings: ManualReviewCandidate[] | null
  parsed: ManualReviewParsed | null
  created_at: string
}

type ManualReviewQueueProps = {
  salonId: string
  salonSlug: string
}

function eventTypeBadgeClass(eventType: string): string {
  if (eventType === 'created') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (eventType === 'cancelled') return 'bg-red-50 text-red-700 border-red-200'
  if (eventType === 'rescheduled') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-muted text-muted-foreground border-border'
}

function reviewReasonBadgeClass(reviewReason: string | null): string {
  if (reviewReason === 'cancel_not_found') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (reviewReason === 'ambiguous_match') return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-muted text-muted-foreground border-border'
}

function formatDateTime(date?: string, time?: string): string {
  if (!date) return '-'

  const value = time ? `${date}T${time}` : date
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return time ? `${date} ${time}` : date
  }

  return parsedDate.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function asEvents(payload: unknown): ManualReviewEvent[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .filter((item): item is ManualReviewEvent => !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string')
    .map((event) => ({
      ...event,
      candidate_bookings: Array.isArray(event.candidate_bookings) ? event.candidate_bookings : null,
      parsed: event.parsed && typeof event.parsed === 'object' ? event.parsed : null,
    }))
}

export function ManualReviewQueue({ salonId, salonSlug }: ManualReviewQueueProps) {
  const [events, setEvents] = useState<ManualReviewEvent[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadEvents = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/internal/booksy/manual-review', { method: 'GET', cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Nie udalo sie pobrac listy do recznej weryfikacji')
        }

        const payload = await response.json()
        if (!active) return
        setEvents(asEvents(payload))
      } catch (fetchError) {
        if (!active) return
        const message = fetchError instanceof Error ? fetchError.message : 'Nie udalo sie pobrac listy do recznej weryfikacji'
        setError(message)
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void loadEvents()

    return () => {
      active = false
    }
  }, [salonId, salonSlug])

  const hasEvents = useMemo(() => events.length > 0, [events])

  const removeEventFromQueue = (eventId: string) => {
    setEvents((previous) => previous.filter((event) => event.id !== eventId))
    setSelectedCandidates((previous) => {
      const next = { ...previous }
      delete next[eventId]
      return next
    })
  }

  const approveEvent = async (event: ManualReviewEvent) => {
    const selectedCandidateId = selectedCandidates[event.id]

    setPendingEventId(event.id)
    setError(null)

    try {
      const response = await fetch('/api/internal/booksy/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedEventId: event.id,
          bookingId: selectedCandidateId || undefined,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        const message =
          typeof (errorPayload as { error?: unknown }).error === 'string'
            ? (errorPayload as { error: string }).error
            : 'Nie udalo sie zatwierdzic wpisu'
        throw new Error(message)
      }

      removeEventFromQueue(event.id)
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : 'Nie udalo sie zatwierdzic wpisu'
      setError(message)
    } finally {
      setPendingEventId(null)
    }
  }

  const discardEvent = async (eventId: string) => {
    setPendingEventId(eventId)
    setError(null)

    try {
      const response = await fetch('/api/internal/booksy/manual-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedEventId: eventId,
          action: 'discard',
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        const message =
          typeof (errorPayload as { error?: unknown }).error === 'string'
            ? (errorPayload as { error: string }).error
            : 'Nie udalo sie odrzucic wpisu'
        throw new Error(message)
      }

      removeEventFromQueue(eventId)
    } catch (discardError) {
      const message = discardError instanceof Error ? discardError.message : 'Nie udalo sie odrzucic wpisu'
      setError(message)
    } finally {
      setPendingEventId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasEvents ? (
        <div className="rounded-lg border-2 border-dashed bg-muted/20 py-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Brak rezerwacji do przejrzenia</p>
        </div>
      ) : (
        events.map((event) => {
          const candidates = event.candidate_bookings ?? []
          const selectedBookingId = selectedCandidates[event.id] ?? ''
          const isEventPending = pendingEventId === event.id

          return (
            <Card key={event.id}>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={eventTypeBadgeClass(event.event_type)}>
                    {event.event_type}
                  </Badge>
                  <Badge variant="outline" className={reviewReasonBadgeClass(event.review_reason)}>
                    {event.review_reason ?? 'manual_review'}
                  </Badge>
                  {event.parsed?.source === 'forwarded' ? <Badge variant="secondary">forwarded</Badge> : null}
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Klient:</span> {event.parsed?.clientName ?? '-'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Usluga:</span> {event.parsed?.serviceName ?? '-'}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Nowy termin:</span>{' '}
                    {formatDateTime(event.parsed?.bookingDate, event.parsed?.bookingTime)}
                  </p>
                </div>
              </CardHeader>

              {candidates.length > 0 ? (
                <CardContent className="space-y-2">
                  <RadioGroup
                    value={selectedBookingId}
                    onValueChange={(value) =>
                      setSelectedCandidates((previous) => ({
                        ...previous,
                        [event.id]: value,
                      }))
                    }
                    className="space-y-2"
                  >
                    {candidates.map((candidate) => {
                      const inputId = `manual-review-${event.id}-${candidate.id}`
                      return (
                        <div key={candidate.id} className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted/40">
                          <RadioGroupItem id={inputId} value={candidate.id} />
                          <Label htmlFor={inputId} className="cursor-pointer space-y-0.5 text-sm">
                            <p className="font-medium">{formatDateTime(candidate.appointmentDate, candidate.startTime)}</p>
                            <p className="text-muted-foreground">
                              {candidate.clientName ?? '-'} - {candidate.serviceName ?? '-'}
                            </p>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                </CardContent>
              ) : null}

              <CardFooter className="justify-end gap-2">
                <Button
                  onClick={() => approveEvent(event)}
                  disabled={isEventPending || (candidates.length > 0 && !selectedBookingId)}
                >
                  {isEventPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Zatwierdź
                </Button>
                <Button variant="outline" onClick={() => discardEvent(event.id)} disabled={isEventPending}>
                  Odrzuć
                </Button>
              </CardFooter>
            </Card>
          )
        })
      )}
    </div>
  )
}
