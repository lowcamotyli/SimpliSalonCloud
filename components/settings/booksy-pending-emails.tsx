'use client'

import { useState } from 'react'
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
import { Tabs } from '@/components/ui/tabs'
import { TabsContent } from '@/components/ui/tabs'
import { TabsList } from '@/components/ui/tabs'
import { TabsTrigger } from '@/components/ui/tabs'
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
  bookingDate?: string
  bookingTime?: string
}

interface ManualReviewEvent {
  id: string
  event_type: 'created' | 'cancelled' | 'rescheduled' | string
  review_reason: string | null
  candidate_bookings: ManualReviewCandidate[] | null
  payload?: { parsed?: ManualReviewParsedPayload | null } | null
  parsed?: ManualReviewParsedPayload | null
}

export function BooksyPendingEmails({ salonId }: { salonId: string }) {
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState<'pending' | 'manual_review'>('pending')
  const [selectedEmail, setSelectedEmail] = useState<PendingEmail | null>(null)
  const [targetServiceId, setTargetServiceId] = useState<string>('')
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('')
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({})

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
      const res = await fetch(`/api/internal/booksy/manual-review?salonId=${encodeURIComponent(salonId)}`)
      if (!res.ok) throw new Error('Failed to fetch manual review events')
      const payload = await res.json() as {
        events?: ManualReviewEvent[]
        manualReview?: ManualReviewEvent[]
        count?: number
      }
      const events = payload.events ?? payload.manualReview ?? []
      return { events, count: payload.count ?? events.length }
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
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/booksy/pending/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignored' }),
      })
      if (!res.ok) throw new Error('Blad podczas ignorowania')
    },
    onSuccess: () => {
      toast.success('Email zostal zignorowany')
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] })
    },
    onError: () => toast.error('Nie udalo sie zignorowac emaila'),
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
        throw new Error(err.error || 'Blad podczas tworzenia rezerwacji')
      }
    },
    onSuccess: () => {
      toast.success('Rezerwacja zostala utworzona pomyslnie')
      queryClient.invalidateQueries({ queryKey: ['booksy-pending', salonId] })
      setSelectedEmail(null)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const approveManualReviewMutation = useMutation({
    mutationFn: async ({ parsedEventId, bookingId }: { parsedEventId: string; bookingId?: string }) => {
      const res = await fetch('/api/internal/booksy/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedEventId, bookingId }),
      })
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}))
        throw new Error((errorPayload as { error?: string }).error ?? 'Nie udalo sie zatwierdzic dopasowania')
      }
    },
    onSuccess: () => {
      toast.success('Zatwierdzono dopasowanie')
      queryClient.invalidateQueries({ queryKey: ['booksy-manual-review', salonId] })
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

  const manualReviewEventTypeLabel = (eventType: string) => {
    if (eventType === 'created') return 'created'
    if (eventType === 'cancelled') return 'cancelled'
    if (eventType === 'rescheduled') return 'rescheduled'
    return eventType || 'unknown'
  }

  const pendingCount = pendingData?.count ?? 0
  const manualReviewCount = manualReviewData?.count ?? 0

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Emaile do zaakceptowania
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Wiadomosci z Booksy, ktorych nie udalo sie automatycznie przypisac do grafiku.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as 'pending' | 'manual_review')}>
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                Do akceptacji
                {pendingCount > 0 ? (
                  <Badge variant="destructive" className="text-[10px]">
                    {pendingCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="manual_review" className="gap-2">
                Do przejrzenia
                {manualReviewCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {manualReviewCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {isLoadingPending ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !pendingData?.pending.length ? (
                <div className="rounded-lg border-2 border-dashed bg-muted/20 py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">Brak emaili oczekujacych na akcje</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500">
                        <th className="pb-2 pr-3 text-left font-medium">Data</th>
                        <th className="pb-2 pr-3 text-left font-medium">Klient</th>
                        <th className="pb-2 pr-3 text-left font-medium">Usluga (email)</th>
                        <th className="pb-2 pr-3 text-left font-medium">Pracownik (email)</th>
                        <th className="pb-2 pr-3 text-left font-medium">Powod bledu</th>
                        <th className="pb-2 text-right font-medium">Akcje</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pendingData.pending.map((email) => (
                        <tr key={email.id} className="transition-colors hover:bg-gray-50">
                          <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-600">
                            {formatDate(email.parsed_data?.bookingDate, email.parsed_data?.bookingTime)}
                          </td>
                          <td className="py-2 pr-3">
                            <p className="text-xs font-medium text-gray-900">{email.parsed_data?.clientName ?? '-'}</p>
                            {email.parsed_data?.clientPhone ? (
                              <p className="text-xs text-gray-400">{email.parsed_data.clientPhone}</p>
                            ) : null}
                          </td>
                          <td className="max-w-[150px] truncate py-2 pr-3 text-xs italic text-gray-500">
                            {email.parsed_data?.serviceName ?? '-'}
                          </td>
                          <td className="max-w-[130px] truncate py-2 pr-3 text-xs italic text-gray-500">
                            {email.parsed_data?.employeeName ?? '-'}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="space-y-1">
                              {getReasonBadge(email.failure_reason)}
                              {email.failure_detail ? (
                                <p className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={email.failure_detail}>
                                  {email.failure_detail}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="space-x-1.5 whitespace-nowrap py-2 text-right">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 gap-1 px-2.5 text-xs"
                                      disabled={['parse_failed', 'cancel_not_found', 'reschedule_not_found'].includes(email.failure_reason)}
                                      onClick={() => handleOpenAssign(email)}
                                    >
                                      <UserPlus className="h-3.5 w-3.5" />
                                      Przypisz
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {email.failure_reason === 'parse_failed' ? (
                                  <TooltipContent>
                                    <p>Email nie mogl byc sparsowany</p>
                                  </TooltipContent>
                                ) : null}
                                {(email.failure_reason === 'cancel_not_found' || email.failure_reason === 'reschedule_not_found') ? (
                                  <TooltipContent>
                                    <p>Wizyta nie istnieje w systemie - zignoruj ten wpis</p>
                                  </TooltipContent>
                                ) : null}
                              </Tooltip>
                            </TooltipProvider>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => ignoreMutation.mutate(email.id)}
                              disabled={ignoreMutation.isPending}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Ignoruj
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual_review" className="space-y-3">
              {isLoadingManualReview ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !manualReviewData?.events.length ? (
                <div className="rounded-lg border-2 border-dashed bg-muted/20 py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">Brak zdarzen do przejrzenia</p>
                </div>
              ) : (
                manualReviewData.events.map((event) => {
                  const parsed = event.payload?.parsed ?? event.parsed ?? null
                  const candidates = event.candidate_bookings ?? []
                  const selectedBookingId = selectedCandidates[event.id] ?? ''

                  return (
                    <Card key={event.id}>
                      <CardHeader className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{manualReviewEventTypeLabel(event.event_type)}</Badge>
                          <Badge variant="secondary">{manualReviewReasonLabel(event.review_reason)}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p><span className="font-medium text-foreground">Klient:</span> {parsed?.clientName ?? '-'}</p>
                          <p><span className="font-medium text-foreground">Usluga:</span> {parsed?.serviceName ?? '-'}</p>
                          <p><span className="font-medium text-foreground">Nowy termin:</span> {formatDate(parsed?.bookingDate, parsed?.bookingTime)}</p>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {candidates.length > 0 ? (
                          <RadioGroup
                            value={selectedBookingId}
                            onValueChange={(value) => setSelectedCandidates((previous) => ({ ...previous, [event.id]: value }))}
                            className="space-y-2"
                          >
                            {candidates.map((candidate) => (
                              <label
                                key={candidate.id}
                                htmlFor={`manual-review-${event.id}-${candidate.id}`}
                                className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted/40"
                              >
                                <RadioGroupItem id={`manual-review-${event.id}-${candidate.id}`} value={candidate.id} />
                                <div className="text-sm">
                                  <p className="font-medium">{formatDate(candidate.appointmentDate, candidate.startTime)}</p>
                                  <p className="text-muted-foreground">{candidate.clientName ?? '-'} • {candidate.serviceName ?? '-'}</p>
                                </div>
                              </label>
                            ))}
                          </RadioGroup>
                        ) : null}

                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => discardManualReviewMutation.mutate(event.id)}
                            disabled={discardManualReviewMutation.isPending || approveManualReviewMutation.isPending}
                          >
                            Odrzuc
                          </Button>
                          <Button
                            onClick={() =>
                              approveManualReviewMutation.mutate({
                                parsedEventId: event.id,
                                bookingId: selectedBookingId || undefined,
                              })
                            }
                            disabled={
                              discardManualReviewMutation.isPending ||
                              approveManualReviewMutation.isPending ||
                              (candidates.length > 0 && !selectedBookingId)
                            }
                          >
                            Zatwierdz
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </TabsContent>
          </Tabs>
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
