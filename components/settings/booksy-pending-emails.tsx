'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Calendar, CheckCircle2, Loader2, Scissors, Trash2, User, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CardContent } from '@/components/ui/card'
import { CardDescription } from '@/components/ui/card'
import { CardHeader } from '@/components/ui/card'
import { CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { DialogContent } from '@/components/ui/dialog'
import { DialogHeader } from '@/components/ui/dialog'
import { DialogTitle } from '@/components/ui/dialog'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioGroupItem } from '@/components/ui/radio-group'
import { Select } from '@/components/ui/select'
import { SelectContent } from '@/components/ui/select'
import { SelectItem } from '@/components/ui/select'
import { SelectTrigger } from '@/components/ui/select'
import { SelectValue } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { TooltipContent } from '@/components/ui/tooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TooltipTrigger } from '@/components/ui/tooltip'

interface PendingEmail {
  id: string
  source?: 'pending_email' | 'manual_review'
  message_id: string
  subject: string | null
  body_snippet: string | null
  parsed_data: {
    clientName?: string
    clientPhone?: string
    serviceName?: string
    employeeName?: string
    price?: number
    bookingDate?: string
    bookingTime?: string
  } | null
  failure_reason: 'parse_failed' | 'service_not_found' | 'employee_not_found' | 'cancel_not_found' | 'reschedule_not_found' | 'other'
  failure_detail: string | null
  status: 'pending' | 'resolved' | 'ignored'
  created_at: string
}

interface Service {
  id: string
  name: string
  price: number
  duration: number
}

interface Employee {
  id: string
  first_name: string
  last_name: string | null
}

interface ManualReviewCandidate {
  id: string
  appointmentDate?: string
  startTime?: string
  clientName?: string | null
  serviceName?: string | null
}

interface ManualReviewParsedPayload {
  clientName?: string
  serviceName?: string
  employeeName?: string
  bookingDate?: string
  bookingTime?: string
}

interface ManualReviewEvent {
  id: string
  created_at?: string
  event_type: 'created' | 'cancelled' | 'rescheduled' | string
  review_reason: string | null
  candidate_bookings: ManualReviewCandidate[] | null
  payload?: { parsed?: ManualReviewParsedPayload | null } | null
  parsed?: ManualReviewParsedPayload | null
}

type UnifiedQueueItem =
  | ({ itemType: 'pending_email' } & PendingEmail)
  | ({ itemType: 'manual_review' } & ManualReviewEvent)

export function BooksyPendingEmails({ salonId }: { salonId: string }) {
  const queryClient = useQueryClient()
  const [selectedEmail, setSelectedEmail] = useState<PendingEmail | null>(null)
  const [targetServiceId, setTargetServiceId] = useState<string>('')
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('')
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({})
  const [selectedManualEmployees, setSelectedManualEmployees] = useState<Record<string, string>>({})

  const { data: pendingData, isLoading: isLoadingPending } = useQuery({
    queryKey: ['booksy-pending', salonId],
    queryFn: async () => {
      const res = await fetch('/api/integrations/booksy/pending?status=pending')
      if (!res.ok) throw new Error('Failed to fetch pending emails')
      return res.json() as Promise<{ pending: PendingEmail[]; count: number }>
    },
    enabled: !!salonId,
  })

  const { data: manualReviewData, isLoading: isLoadingManualReview } = useQuery({
    queryKey: ['booksy-manual-review', salonId],
    queryFn: async () => {
      const res = await fetch('/api/internal/booksy/manual-review')
      if (!res.ok) throw new Error('Nie udało się pobrać zdarzeń do przejrzenia')
      const payload = await res.json() as ManualReviewEvent[] | { events?: ManualReviewEvent[]; manualReview?: ManualReviewEvent[] }
      const events = Array.isArray(payload)
        ? payload
        : payload.events ?? payload.manualReview ?? []
      return { events, count: events.length }
    },
    enabled: !!salonId,
  })

  const { data: services } = useQuery<Service[]>({
    queryKey: ['services-active', salonId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, duration')
        .eq('salon_id', salonId)
        .eq('active', true)
      if (error) throw error
      return data ?? []
    },
    enabled: !!salonId,
  })

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['employees-active', salonId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('salon_id', salonId)
        .is('deleted_at', null)
      if (error) throw error
      return data ?? []
    },
    enabled: !!salonId,
  })

  const ignoreMutation = useMutation({
    mutationFn: async ({ id, source }: { id: string; source?: 'pending_email' | 'manual_review' }) => {
      const isManualReviewSource = source === 'manual_review'
      const endpoint = isManualReviewSource
        ? '/api/internal/booksy/manual-review'
        : `/api/integrations/booksy/pending/${id}`
      const body = isManualReviewSource
        ? { parsedEventId: id, action: 'discard' as const }
        : { status: 'ignored' as const }

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Blad podczas ignorowania')
      return { source }
    },
    onSuccess: ({ source }) => {
      toast.success('Wpis zignorowany — nie będzie już widoczny w kolejce')
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] })
      if (source === 'manual_review') {
        queryClient.invalidateQueries({ queryKey: ['booksy-manual-review', salonId] })
      }
    },
    onError: () => toast.error('Nie udało się zignorować wpisu'),
  })

  const assignMutation = useMutation({
    mutationFn: async ({
      id,
      serviceId,
      employeeId,
    }: {
      id: string
      serviceId: string
      employeeId: string
    }) => {
      const res = await fetch(`/api/integrations/booksy/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, employeeId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as { error?: string }).error ?? 'Nie udało się utworzyć rezerwacji')
      }
    },
    onSuccess: () => {
      toast.success('Rezerwacja została dodana do grafiku')
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] })
      setSelectedEmail(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const approveManualReviewMutation = useMutation({
    mutationFn: async ({
      parsedEventId,
      bookingId,
      employeeId,
      eventType,
    }: {
      parsedEventId: string
      bookingId?: string
      employeeId?: string
      eventType?: string
    }) => {
      const res = await fetch(`/api/integrations/booksy/manual-review/${encodeURIComponent(parsedEventId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, employeeId }),
      })
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}))
        throw new Error((errorPayload as { error?: string }).error ?? 'Nie udało się przetworzyć zdarzenia')
      }
      return { eventType }
    },
    onSuccess: ({ eventType }) => {
      const msg = eventType === 'cancelled'
        ? 'Wizyta została anulowana w grafiku'
        : eventType === 'rescheduled'
          ? 'Termin wizyty został zaktualizowany w grafiku'
          : 'Wizyta została dodana do grafiku'
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['booksy-manual-review', salonId] })
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const discardManualReviewMutation = useMutation({
    mutationFn: async (parsedEventId: string) => {
      const res = await fetch('/api/internal/booksy/manual-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedEventId, action: 'discard' }),
      })
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}))
        throw new Error((errorPayload as { error?: string }).error ?? 'Nie udalo sie odrzucic wpisu')
      }
    },
    onSuccess: () => {
      toast.success('Wpis odrzucony')
      queryClient.invalidateQueries({ queryKey: ['booksy-manual-review', salonId] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const handleOpenAssign = (email: PendingEmail) => {
    setSelectedEmail(email)

    const emailServiceName = email.parsed_data?.serviceName ?? ''
    const matchedService = services?.find(
      (service) =>
        service.name.toLowerCase().includes(emailServiceName.toLowerCase()) ||
        emailServiceName.toLowerCase().includes(service.name.toLowerCase())
    )
    setTargetServiceId(matchedService?.id ?? '')

    const emailEmployeeName = email.parsed_data?.employeeName ?? ''
    const matchedEmployee = employees?.find((employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.toLowerCase()
      return (
        fullName.includes(emailEmployeeName.toLowerCase()) ||
        emailEmployeeName.toLowerCase().includes(employee.first_name.toLowerCase())
      )
    })
    setTargetEmployeeId(matchedEmployee?.id ?? '')
  }

  const getReasonBadge = (reason: PendingEmail['failure_reason']) => {
    switch (reason) {
      case 'service_not_found':
        return (
          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-xs text-amber-700">
            Usluga nie znaleziona
          </Badge>
        )
      case 'employee_not_found':
        return (
          <Badge variant="outline" className="bg-orange-50 border-orange-200 text-xs text-orange-700">
            Pracownik nie znaleziony
          </Badge>
        )
      case 'parse_failed':
        return (
          <Badge variant="outline" className="bg-red-50 border-red-200 text-xs text-red-700">
            Blad parsowania
          </Badge>
        )
      case 'cancel_not_found':
        return (
          <Badge variant="outline" className="bg-blue-50 border-blue-200 text-xs text-blue-700">
            Anulowanie - brak wizyty
          </Badge>
        )
      case 'reschedule_not_found':
        return (
          <Badge variant="outline" className="bg-purple-50 border-purple-200 text-xs text-purple-700">
            Zmiana - brak wizyty
          </Badge>
        )
      default:
        return <Badge variant="secondary" className="text-xs">Inny</Badge>
    }
  }

  const formatDate = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return '-'
    const combined = timeStr ? `${dateStr}T${timeStr}` : dateStr
    try {
      return new Date(combined).toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const manualReviewReasonLabel = (reason: string | null) => {
    if (reason === 'ambiguous_match') return 'Niejednoznaczne dopasowanie'
    if (reason === 'cancel_not_found') return 'Brak wizyty do anulowania'
    if (reason === 'validation') return 'Walidacja'
    if (reason === 'low_confidence') return 'Niska pewnosc'
    if (reason === 'unknown') return 'Nieznany powod'
    return reason ?? 'Nieznany powod'
  }

  const cleanServiceName = (name: string | null | undefined): string | null => {
    if (!name) return null
    if (name.startsWith('[image:') || name.startsWith('http')) return null
    const withoutUrls = name.replace(/<https?:\/\/[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').trim()
    return withoutUrls.length > 0 ? withoutUrls : null
  }

  const translateDetail = (detail: string | null): string | null => {
    if (!detail) return null
    return detail
      .replace(/Employee not found:\s*/i, 'Pracownik nie znaleziony: ')
      .replace(/Service not found:\s*/i, 'Usługa nie znaleziona: ')
      .replace(/Client phone is required for Booksy bookings/i, 'Numer telefonu klienta jest wymagany dla rezerwacji Booksy')
      .replace(/Could not parse/i, 'Nie udało się przetworzyć wiadomości')
      .replace(/Booking to cancel not found/i, 'Nie znaleziono wizyty do anulowania')
      .replace(/Booking to reschedule not found/i, 'Nie znaleziono wizyty do przełożenia')
      .replace(/Wymaga recznej weryfikacji \(confidence ([\d.]+)\)/i, (_m, score) => `Wymaga ręcznej weryfikacji (pewność: ${score})`)
  }

  const manualReviewEventTypeLabel = (eventType: string) => {
    if (eventType === 'created') return 'Nowa wizyta'
    if (eventType === 'cancelled') return 'Anulowanie'
    if (eventType === 'rescheduled') return 'Zmiana terminu'
    return eventType || 'Nieznany typ'
  }

  const isQueueLoading = isLoadingPending || isLoadingManualReview

  const getUnifiedSortTimestamp = (item: UnifiedQueueItem) => {
    if (item.itemType === 'pending_email') {
      const bookingDate = item.parsed_data?.bookingDate
      const bookingTime = item.parsed_data?.bookingTime
      if (bookingDate) {
        const parsed = Date.parse(bookingTime ? `${bookingDate}T${bookingTime}` : bookingDate)
        if (!Number.isNaN(parsed)) return parsed
      }
      const fallback = Date.parse(item.created_at)
      return Number.isNaN(fallback) ? 0 : fallback
    }

    const parsedPayload = item.payload?.parsed ?? item.parsed ?? null
    const bookingDate = parsedPayload?.bookingDate
    const bookingTime = parsedPayload?.bookingTime
    if (bookingDate) {
      const parsed = Date.parse(bookingTime ? `${bookingDate}T${bookingTime}` : bookingDate)
      if (!Number.isNaN(parsed)) return parsed
    }
    const fallback = item.created_at ? Date.parse(item.created_at) : Number.NaN
    return Number.isNaN(fallback) ? 0 : fallback
  }

  const deduplicatedPending = useMemo(() => {
    const reviewKeys = new Set(
      (manualReviewData?.events ?? []).map((e) => {
        const p = e.payload?.parsed ?? e.parsed ?? null
        return `${p?.clientName ?? ''}|${p?.bookingDate ?? ''}|${p?.bookingTime ?? ''}`
      })
    )
    return (pendingData?.pending ?? []).filter((email) => {
      const key = `${email.parsed_data?.clientName ?? ''}|${email.parsed_data?.bookingDate ?? ''}|${email.parsed_data?.bookingTime ?? ''}`
      return !reviewKeys.has(key)
    })
  }, [pendingData, manualReviewData])

  const unifiedQueue: UnifiedQueueItem[] = [
    ...deduplicatedPending.map((email) => ({ ...email, itemType: 'pending_email' as const })),
    ...(manualReviewData?.events ?? []).map((event) => ({ ...event, itemType: 'manual_review' as const })),
  ].sort((a, b) => getUnifiedSortTimestamp(b) - getUnifiedSortTimestamp(a))

  const totalCount = unifiedQueue.length

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Wymagają obsługi
            </CardTitle>
            <Badge variant={totalCount > 0 ? 'destructive' : 'secondary'} className="text-[10px]">
              {totalCount}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Wiadomosci z Booksy, ktorych nie udalo sie automatycznie przypisac do grafiku.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {isQueueLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !unifiedQueue.length ? (
            <div className="rounded-lg border-2 border-dashed bg-muted/20 py-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Brak elementów do obsługi</p>
            </div>
          ) : (
            <div className="divide-y">
              {unifiedQueue.map((item) => {
                if (item.itemType === 'pending_email') {
                  const canAssign = !['parse_failed', 'cancel_not_found', 'reschedule_not_found'].includes(item.failure_reason)
                  const tooltipText = item.failure_reason === 'parse_failed'
                    ? 'Email nie mógł być sparsowany — brak możliwości przypisania'
                    : (item.failure_reason === 'cancel_not_found' || item.failure_reason === 'reschedule_not_found')
                      ? 'Wizyta nie istnieje w systemie — zignoruj ten wpis'
                      : null
                  const actionHint = item.failure_reason === 'parse_failed'
                    ? 'Wiadomość nie mogła być odczytana automatycznie. Zignoruj jeśli nie dotyczy żadnej wizyty.'
                    : (item.failure_reason === 'cancel_not_found' || item.failure_reason === 'reschedule_not_found')
                      ? 'Wizyta do anulowania/przełożenia nie istnieje w systemie. Możesz zignorować ten wpis.'
                      : 'System nie rozpoznał usługi lub pracownika. Kliknij Przypisz, wybierz właściwe dane i zatwierdź.'

                  return (
                    <div key={`pe-${item.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getReasonBadge(item.failure_reason)}
                        </div>
                        <p className="text-sm font-medium">{item.parsed_data?.clientName ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(item.parsed_data?.bookingDate, item.parsed_data?.bookingTime)}
                          {cleanServiceName(item.parsed_data?.serviceName) ? <> · <span className="italic">{cleanServiceName(item.parsed_data?.serviceName)}</span></> : null}
                          {item.parsed_data?.employeeName ? <> · {item.parsed_data.employeeName}</> : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">{actionHint}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button size="sm" variant="default" className="h-7 gap-1 px-2.5 text-xs" disabled={!canAssign} onClick={() => handleOpenAssign(item)}>
                                  <UserPlus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Przypisz</span>
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {tooltipText ? <TooltipContent><p>{tooltipText}</p></TooltipContent> : null}
                          </Tooltip>
                        </TooltipProvider>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => ignoreMutation.mutate({ id: item.id, source: item.source })} disabled={ignoreMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Ignoruj</span>
                        </Button>
                      </div>
                    </div>
                  )
                }

                const parsed = item.payload?.parsed ?? item.parsed ?? null
                const candidates = item.candidate_bookings ?? []
                const selectedBookingId = selectedCandidates[item.id] ?? ''
                const selectedEmployeeId = selectedManualEmployees[item.id] ?? ''
                const needsEmployeeSelection = candidates.length === 0 && !parsed?.employeeName && (item.event_type === 'created' || item.event_type === 'rescheduled')
                const isBusy = discardManualReviewMutation.isPending || approveManualReviewMutation.isPending

                return (
                  <div key={`mr-${item.id}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <Badge variant="outline" className="text-[10px]">{manualReviewEventTypeLabel(item.event_type)}</Badge>
                        <p className="text-sm font-medium">{parsed?.clientName ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(parsed?.bookingDate, parsed?.bookingTime)}
                          {cleanServiceName(parsed?.serviceName) ? <> · <span className="italic">{cleanServiceName(parsed?.serviceName)}</span></> : null}
                        </p>
                        {candidates.length > 0 ? (
                          <p className="text-[11px] text-amber-700 mt-0.5">Wybierz poniżej która wizyta pasuje, a następnie kliknij Zatwierdź.</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                            {item.event_type === 'cancelled' ? 'Kliknij Zatwierdź aby anulować tę wizytę w grafiku.' : item.event_type === 'rescheduled' ? 'Kliknij Zatwierdź aby zaktualizować termin wizyty w grafiku.' : 'Kliknij Zatwierdź aby dodać tę wizytę do grafiku.'}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => discardManualReviewMutation.mutate(item.id)} disabled={isBusy}>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Odrzuć</span>
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          disabled={isBusy || (candidates.length > 0 && !selectedBookingId) || (needsEmployeeSelection && !selectedEmployeeId)}
                          onClick={() => approveManualReviewMutation.mutate({
                            parsedEventId: item.id,
                            bookingId: selectedBookingId || undefined,
                            employeeId: selectedEmployeeId || undefined,
                            eventType: item.event_type,
                          })}
                        >
                          {approveManualReviewMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Zatwierdź
                        </Button>
                      </div>
                    </div>
                    {candidates.length > 0 ? (
                      <RadioGroup
                        value={selectedBookingId}
                        onValueChange={(value) => setSelectedCandidates((prev) => ({ ...prev, [item.id]: value }))}
                        className="space-y-1"
                      >
                        {candidates.map((candidate) => (
                          <label key={candidate.id} htmlFor={`mr-${item.id}-${candidate.id}`} className="flex cursor-pointer items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs hover:bg-muted/60">
                            <RadioGroupItem id={`mr-${item.id}-${candidate.id}`} value={candidate.id} />
                            <span className="font-medium">{formatDate(candidate.appointmentDate, candidate.startTime)}</span>
                            <span className="text-muted-foreground">{candidate.clientName ?? '-'} · {candidate.serviceName ?? '-'}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    ) : null}
                    {needsEmployeeSelection ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Wybierz pracownika do utworzenia wizyty</label>
                        <Select
                          value={selectedEmployeeId}
                          onValueChange={(value) => setSelectedManualEmployees((prev) => ({ ...prev, [item.id]: value }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Wybierz pracownika..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(employees ?? []).map((employee) => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.first_name} {employee.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Reczne przypisanie rezerwacji
            </DialogTitle>
          </DialogHeader>

          {selectedEmail ? (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="space-y-0.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <User className="h-3 w-3" /> Klient
                  </span>
                  <p className="text-sm font-medium">
                    {selectedEmail.parsed_data?.clientName ?? 'Brak danych'}
                  </p>
                  {selectedEmail.parsed_data?.clientPhone ? (
                    <p className="text-xs text-muted-foreground">{selectedEmail.parsed_data.clientPhone}</p>
                  ) : null}
                </div>
                <div className="space-y-0.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Data wizyty
                  </span>
                  <p className="text-sm font-medium">
                    {formatDate(selectedEmail.parsed_data?.bookingDate, selectedEmail.parsed_data?.bookingTime)}
                  </p>
                </div>
                <div className="col-span-1 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Oryginalna usluga
                  </span>
                  <p className="text-xs italic text-muted-foreground">
                    {selectedEmail.parsed_data?.serviceName ?? '-'}
                  </p>
                </div>
                <div className="col-span-1 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Oryginalny pracownik
                  </span>
                  <p className="text-xs italic text-muted-foreground">
                    {selectedEmail.parsed_data?.employeeName ?? '-'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Usluga</label>
                  <Select value={targetServiceId} onValueChange={setTargetServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz usluge..." />
                    </SelectTrigger>
                    <SelectContent>
                      {services?.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - {service.price} zl
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Pracownik</label>
                  <Select value={targetEmployeeId} onValueChange={setTargetEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz pracownika..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-2">
                <Button variant="outline" onClick={() => setSelectedEmail(null)}>
                  Anuluj
                </Button>
                <Button
                  onClick={() =>
                    assignMutation.mutate({
                      id: selectedEmail.id,
                      serviceId: targetServiceId,
                      employeeId: targetEmployeeId,
                    })
                  }
                  disabled={!targetServiceId || !targetEmployeeId || assignMutation.isPending}
                >
                  {assignMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Utworz rezerwacje
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
