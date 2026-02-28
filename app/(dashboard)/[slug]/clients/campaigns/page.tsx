'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CRMUsageBanner } from '@/components/crm/usage-banner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
type Channel = 'email' | 'sms' | 'both'

type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  channel: Channel
  template_id: string | null
  segment_filters: Record<string, unknown>
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  created_at: string
}

type Template = {
  id: string
  name: string
  channel: Channel
  subject: string | null
  body: string
}

type SegmentFilters = {
  lastVisitDaysBefore?: number | null
  lastVisitDaysAfter?: number | null
  minVisitCount?: number | null
  maxVisitCount?: number | null
  minTotalSpent?: number | null
  maxTotalSpent?: number | null
  birthdayThisWeek?: boolean
  smsOptIn?: boolean
  emailOptIn?: boolean
}

type CampaignStats = {
  total: number
  sent: number
  failed: number
  pending: number
  delivered: number
  bounced: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Szkic',
  scheduled: 'Zaplanowana',
  sending: 'Wysyłanie',
  sent: 'Wysłana',
  cancelled: 'Anulowana',
}

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const CHANNEL_LABELS: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  both: 'Email + SMS',
}

const CHANNEL_COLORS: Record<Channel, string> = {
  email: 'bg-blue-50 text-blue-600',
  sms: 'bg-purple-50 text-purple-600',
  both: 'bg-indigo-50 text-indigo-600',
}

const SEGMENT_PRESETS = [
  {
    id: 'sleeping',
    label: 'Śpiący klienci',
    description: 'Brak wizyty od 30 dni',
    filters: { lastVisitDaysBefore: 30 } as SegmentFilters,
  },
  {
    id: 'regular',
    label: 'Stali klienci',
    description: '5+ wizyt',
    filters: { minVisitCount: 5 } as SegmentFilters,
  },
  {
    id: 'vip',
    label: 'VIP',
    description: 'Wydatki powyżej 1000 zł',
    filters: { minTotalSpent: 1000 } as SegmentFilters,
  },
  {
    id: 'birthday',
    label: 'Urodziny',
    description: 'Urodziny w tym tygodniu',
    filters: { birthdayThisWeek: true } as SegmentFilters,
  },
  {
    id: 'new',
    label: 'Nowi klienci',
    description: '1 wizyta, max 14 dni',
    filters: { maxVisitCount: 1, lastVisitDaysAfter: 14 } as SegmentFilters,
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CHANNEL_COLORS[channel]}`}>
      {CHANNEL_LABELS[channel]}
    </span>
  )
}

// ─── Segment Preview hook (debounced 500ms) ───────────────────────────────────

function useSegmentPreview(salonId: string, filters: SegmentFilters) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    if (!salonId) {
      setCount(null)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/crm/segments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salonId, filters, sampleSize: 0 }),
        })
        if (res.ok) {
          const data = await res.json()
          setCount(data.count ?? null)
        }
      } catch {
        // ignore preview errors
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // filtersKey is JSON.stringify(filters) – stable enough for debounce
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, filtersKey])

  return { count, loading }
}

// ─── Wizard State ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3

type WizardState = {
  name: string
  channel: Channel
  segmentFilters: SegmentFilters
  selectedPresetId: string | null
  templateId: string | null
  useCustomBody: boolean
  subject: string
  body: string
  scheduleMode: 'now' | 'scheduled'
  scheduledAt: string
}

const WIZARD_INITIAL: WizardState = {
  name: '',
  channel: 'email',
  segmentFilters: {},
  selectedPresetId: null,
  templateId: null,
  useCustomBody: false,
  subject: '',
  body: '',
  scheduleMode: 'now',
  scheduledAt: '',
}

// ─── Campaign Wizard Dialog ───────────────────────────────────────────────────

function CampaignWizard({
  open,
  onClose,
  salonId,
  slug,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  salonId: string
  slug: string
  onCreated: () => void
}) {
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>(WIZARD_INITIAL)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (open) {
      setStep(1)
      setState(WIZARD_INITIAL)
      setError(null)
    }
  }, [open])

  // Fetch templates for step 2 (prefetch on open)
  const { data: templatesData } = useQuery<{ templates: Template[] }>({
    queryKey: ['crm-templates', salonId],
    enabled: !!salonId && open,
    queryFn: async () => {
      const res = await fetch(`/api/crm/templates?salonId=${salonId}`)
      if (!res.ok) throw new Error('Failed to fetch templates')
      return res.json()
    },
  })
  const allTemplates = templatesData?.templates ?? []
  const filteredTemplates = allTemplates.filter(
    (t) => t.channel === 'both' || state.channel === 'both' || t.channel === state.channel
  )

  // Live segment preview (debounced, active throughout wizard when open)
  const { count: previewCount, loading: previewLoading } = useSegmentPreview(
    open ? salonId : '',
    state.segmentFilters
  )

  // Step validation
  const canProceedStep1 = state.name.trim().length >= 2
  const canProceedStep2 = state.useCustomBody
    ? state.body.trim().length > 0 && (state.channel === 'sms' || state.subject.trim().length > 0)
    : !!state.templateId
  const canSend =
    !submitting &&
    (state.scheduleMode === 'now' || (state.scheduleMode === 'scheduled' && !!state.scheduledAt))

  const handlePresetClick = (preset: (typeof SEGMENT_PRESETS)[number]) => {
    update({ selectedPresetId: preset.id, segmentFilters: preset.filters })
  }

  const handleTemplateChange = (id: string) => {
    const tpl = allTemplates.find((t) => t.id === id)
    if (!tpl) return
    update({ templateId: id, useCustomBody: false, subject: tpl.subject ?? '', body: tpl.body })
  }

  const handleSend = async () => {
    setError(null)
    setSubmitting(true)
    try {
      // 1. Create draft campaign
      const createPayload: Record<string, unknown> = {
        salonId,
        name: state.name.trim(),
        channel: state.channel,
        segmentFilters: state.segmentFilters,
        scheduledAt: state.scheduleMode === 'scheduled' ? state.scheduledAt || null : null,
      }
      if (!state.useCustomBody && state.templateId) {
        createPayload.templateId = state.templateId
      } else {
        createPayload.body = state.body.trim()
        if (state.channel !== 'sms') createPayload.subject = state.subject.trim()
      }

      const createRes = await fetch('/api/crm/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error ?? 'Błąd tworzenia kampanii')

      // 2. Enqueue / schedule
      const sendRes = await fetch(`/api/crm/campaigns/${createData.campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId,
          mode: state.scheduleMode,
          scheduledAt: state.scheduleMode === 'scheduled' ? state.scheduledAt || null : null,
        }),
      })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error ?? 'Błąd wysyłki kampanii')

      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieoczekiwany błąd')
    } finally {
      setSubmitting(false)
    }
  }

  const goNext = () => setStep((prev) => (prev + 1) as WizardStep)
  const goBack = () => setStep((prev) => (prev - 1) as WizardStep)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Nowa kampania – krok {step} z 3:{' '}
            {step === 1 ? 'Segment' : step === 2 ? 'Wiadomość' : 'Harmonogram'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Segment ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="campaign-name">Nazwa kampanii *</Label>
              <Input
                id="campaign-name"
                value={state.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="np. Letnia promocja"
              />
            </div>

            <div className="grid gap-2">
              <Label>Kanał wysyłki</Label>
              <Select value={state.channel} onValueChange={(v) => update({ channel: v as Channel })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Email + SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Szybki segment</Label>
              <div className="flex flex-wrap gap-2">
                {SEGMENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      state.selectedPresetId === preset.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {state.selectedPresetId && (
                <p className="text-xs text-muted-foreground">
                  {SEGMENT_PRESETS.find((p) => p.id === state.selectedPresetId)?.description}
                </p>
              )}
            </div>

            <details>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
                Zaawansowane filtry
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Brak wizyty od (dni)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="np. 30"
                    value={state.segmentFilters.lastVisitDaysBefore ?? ''}
                    onChange={(e) =>
                      update({
                        segmentFilters: {
                          ...state.segmentFilters,
                          lastVisitDaysBefore: e.target.value ? Number(e.target.value) : null,
                        },
                        selectedPresetId: null,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Min. liczba wizyt</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="np. 5"
                    value={state.segmentFilters.minVisitCount ?? ''}
                    onChange={(e) =>
                      update({
                        segmentFilters: {
                          ...state.segmentFilters,
                          minVisitCount: e.target.value ? Number(e.target.value) : null,
                        },
                        selectedPresetId: null,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Min. wydatki (zł)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="np. 500"
                    value={state.segmentFilters.minTotalSpent ?? ''}
                    onChange={(e) =>
                      update({
                        segmentFilters: {
                          ...state.segmentFilters,
                          minTotalSpent: e.target.value ? Number(e.target.value) : null,
                        },
                        selectedPresetId: null,
                      })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Max. wydatki (zł)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="np. 2000"
                    value={state.segmentFilters.maxTotalSpent ?? ''}
                    onChange={(e) =>
                      update({
                        segmentFilters: {
                          ...state.segmentFilters,
                          maxTotalSpent: e.target.value ? Number(e.target.value) : null,
                        },
                        selectedPresetId: null,
                      })
                    }
                  />
                </div>
              </div>
            </details>

            <div className="rounded-lg bg-muted px-4 py-3 text-sm">
              {previewLoading ? (
                <span className="text-muted-foreground">Obliczam odbiorców…</span>
              ) : previewCount !== null ? (
                <span>
                  <strong>{previewCount}</strong> klientów pasuje do filtrów
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Wybierz segment, aby zobaczyć liczbę odbiorców
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Message ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={!state.useCustomBody ? 'default' : 'outline'}
                onClick={() => update({ useCustomBody: false })}
              >
                Wybierz szablon
              </Button>
              <Button
                size="sm"
                variant={state.useCustomBody ? 'default' : 'outline'}
                onClick={() => update({ useCustomBody: true, templateId: null })}
              >
                Własna treść
              </Button>
            </div>

            {!state.useCustomBody && (
              <div className="space-y-3">
                {filteredTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Brak szablonów dla kanału {CHANNEL_LABELS[state.channel]}.{' '}
                    <Link href={`/${slug}/clients/templates`} className="underline">
                      Utwórz szablon
                    </Link>
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <Label>Szablon</Label>
                    <Select value={state.templateId ?? ''} onValueChange={handleTemplateChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz szablon…" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {state.templateId && (
                  <div className="rounded border bg-muted p-3 text-sm space-y-1">
                    {state.subject && <p className="font-medium">{state.subject}</p>}
                    <p className="text-muted-foreground whitespace-pre-wrap">{state.body}</p>
                  </div>
                )}
              </div>
            )}

            {state.useCustomBody && (
              <div className="space-y-3">
                {state.channel !== 'sms' && (
                  <div className="grid gap-2">
                    <Label htmlFor="subject">Temat (email) *</Label>
                    <Input
                      id="subject"
                      value={state.subject}
                      onChange={(e) => update({ subject: e.target.value })}
                      placeholder="Temat wiadomości email"
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="body">Treść *</Label>
                    {state.channel !== 'email' && (
                      <span
                        className={`text-xs ${state.body.length > 160 ? 'text-amber-600' : 'text-muted-foreground'}`}
                      >
                        {state.body.length} / 160 znaków (SMS)
                      </span>
                    )}
                  </div>
                  <Textarea
                    id="body"
                    value={state.body}
                    onChange={(e) => update({ body: e.target.value })}
                    rows={5}
                    placeholder="Treść wiadomości. Dostępne zmienne: {{first_name}}, {{salon_name}}, {{booking_link}}"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Schedule ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => update({ scheduleMode: 'now' })}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  state.scheduleMode === 'now'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="font-medium">Wyślij teraz</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Kampania zostanie wysłana natychmiast
                </div>
              </button>

              <button
                type="button"
                onClick={() => update({ scheduleMode: 'scheduled' })}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  state.scheduleMode === 'scheduled'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="font-medium">Zaplanuj wysyłkę</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Wybierz datę i godzinę wysyłki
                </div>
              </button>
            </div>

            {state.scheduleMode === 'scheduled' && (
              <div className="grid gap-2">
                <Label htmlFor="scheduled-at">Data i godzina wysyłki *</Label>
                <Input
                  id="scheduled-at"
                  type="datetime-local"
                  value={state.scheduledAt}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => update({ scheduledAt: e.target.value })}
                />
              </div>
            )}

            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="font-medium text-muted-foreground uppercase tracking-wide text-xs">
                Podsumowanie
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Nazwa:</span>
                <span>{state.name}</span>
                <span className="text-muted-foreground">Kanał:</span>
                <span>{CHANNEL_LABELS[state.channel]}</span>
                <span className="text-muted-foreground">Odbiorcy:</span>
                <span>{previewCount !== null ? `~${previewCount} klientów` : 'N/D'}</span>
                <span className="text-muted-foreground">Wysyłka:</span>
                <span>
                  {state.scheduleMode === 'now'
                    ? 'Natychmiast'
                    : state.scheduledAt
                    ? formatDate(new Date(state.scheduledAt).toISOString())
                    : 'Nie ustawiono'}
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              Wstecz
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          {step < 3 ? (
            <Button
              onClick={goNext}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
            >
              Dalej
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!canSend}>
              {submitting
                ? 'Wysyłanie…'
                : state.scheduleMode === 'now'
                ? 'Wyślij kampanię'
                : 'Zaplanuj kampanię'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Campaign Stats Dialog ────────────────────────────────────────────────────

function CampaignStatsDialog({
  campaignId,
  salonId,
  open,
  onClose,
}: {
  campaignId: string | null
  salonId: string
  open: boolean
  onClose: () => void
}) {
  const { data, isLoading } = useQuery<{ campaign: Campaign; stats: CampaignStats }>({
    queryKey: ['crm-campaign-stats', campaignId, salonId],
    enabled: !!campaignId && !!salonId && open,
    queryFn: async () => {
      const res = await fetch(`/api/crm/campaigns/${campaignId}/stats?salonId=${salonId}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
  })

  const stats = [
    { label: 'Odbiorcy', value: data?.stats.total ?? 0, color: 'text-foreground' },
    { label: 'Wysłane', value: data?.stats.sent ?? 0, color: 'text-blue-600' },
    { label: 'Dostarczone', value: data?.stats.delivered ?? 0, color: 'text-green-600' },
    { label: 'Oczekujące', value: data?.stats.pending ?? 0, color: 'text-yellow-600' },
    { label: 'Błędy', value: data?.stats.failed ?? 0, color: 'text-red-600' },
    { label: 'Odbite', value: data?.stats.bounced ?? 0, color: 'text-orange-600' },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Statystyki kampanii</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{data.campaign.name}</span>
              <StatusBadge status={data.campaign.status} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {stats.map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border p-3 text-center">
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type CampaignsResponse =
  | { campaigns: Campaign[] }
  | { locked: true; reason?: string; upgradeUrl?: string }

export default function CampaignsPage() {
  const params = useParams()
  const slug = params.slug as string
  const queryClient = useQueryClient()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [statsTarget, setStatsTarget] = useState<string | null>(null)

  const { data: salon } = useQuery<{ id: string; slug: string } | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('salons').select('id, slug').eq('slug', slug).single()
      if (error) throw error
      return data
    },
  })
  const salonId = salon?.id ?? ''

  const campaignsQuery = useQuery<CampaignsResponse>({
    queryKey: ['crm-campaigns', salonId],
    enabled: !!salonId,
    queryFn: async () => {
      const res = await fetch(`/api/crm/campaigns?salonId=${salonId}`)
      const payload = await res.json().catch(() => ({}))
      if (res.status === 403) {
        return { locked: true as const, reason: payload?.error, upgradeUrl: payload?.upgradeUrl }
      }
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to fetch campaigns')
      return payload
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/campaigns/${id}?salonId=${salonId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to delete campaign')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-campaigns', salonId] }),
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/campaigns/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to cancel campaign')
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-campaigns', salonId] }),
  })

  const isLocked =
    !campaignsQuery.isLoading &&
    !!campaignsQuery.data &&
    'locked' in campaignsQuery.data &&
    (campaignsQuery.data as { locked: boolean }).locked

  const campaigns =
    !isLocked && campaignsQuery.data && 'campaigns' in campaignsQuery.data
      ? (campaignsQuery.data as { campaigns: Campaign[] }).campaigns
      : []

  const lockedData = isLocked
    ? (campaignsQuery.data as { locked: true; reason?: string; upgradeUrl?: string })
    : null

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-0 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Kampanie</h1>
          <p className="text-muted-foreground">Twórz, planuj i monitoruj kampanie CRM.</p>
        </div>
        {!isLocked && (
          <Button onClick={() => setWizardOpen(true)} disabled={!salonId}>
            + Nowa kampania
          </Button>
        )}
      </div>

      {/* Usage banner */}
      {salonId && <CRMUsageBanner salonId={salonId} slug={slug} />}

      {/* Feature locked */}
      {isLocked && (
        <Card>
          <CardHeader>
            <CardTitle>Funkcja niedostępna w obecnym planie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{lockedData?.reason}</p>
            <Link href={lockedData?.upgradeUrl ?? `/${slug}/billing/upgrade`}>
              <Button>Przejdź do upgrade</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {!isLocked && campaignsQuery.isLoading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLocked && !campaignsQuery.isLoading && campaigns.length === 0 && (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center py-14 text-center gap-4">
            <p className="text-muted-foreground">Brak kampanii. Utwórz pierwszą kampanię CRM.</p>
            <Button onClick={() => setWizardOpen(true)}>+ Nowa kampania</Button>
          </CardContent>
        </Card>
      )}

      {/* Campaign list */}
      {!isLocked && campaigns.length > 0 && (
        <Card>
          <CardContent className="pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Kanał</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Odbiorcy</TableHead>
                  <TableHead className="text-right">Wysłane</TableHead>
                  <TableHead>Data wysyłki</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <ChannelBadge channel={campaign.channel} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right">{campaign.recipient_count ?? 0}</TableCell>
                    <TableCell className="text-right">{campaign.sent_count ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {campaign.sent_at
                        ? formatDate(campaign.sent_at)
                        : campaign.scheduled_at
                        ? formatDate(campaign.scheduled_at)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {/* Stats – visible for sent/sending */}
                        {(campaign.status === 'sent' || campaign.status === 'sending') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatsTarget(campaign.id)}
                          >
                            Statystyki
                          </Button>
                        )}
                        {/* Cancel – only scheduled */}
                        {campaign.status === 'scheduled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(campaign.id)}
                          >
                            Anuluj
                          </Button>
                        )}
                        {/* Delete – draft, cancelled, sent */}
                        {(campaign.status === 'draft' ||
                          campaign.status === 'cancelled' ||
                          campaign.status === 'sent') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Usunąć kampanię "${campaign.name}"?`)) {
                                deleteMutation.mutate(campaign.id)
                              }
                            }}
                          >
                            Usuń
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Wizard dialog */}
      {salonId && (
        <CampaignWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          salonId={salonId}
          slug={slug}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['crm-campaigns', salonId] })
          }}
        />
      )}

      {/* Stats dialog */}
      <CampaignStatsDialog
        campaignId={statsTarget}
        salonId={salonId}
        open={!!statsTarget}
        onClose={() => setStatsTarget(null)}
      />
    </div>
  )
}
