'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type LogSource = 'crm' | 'sms_direct'
type LogChannel = 'email' | 'sms' | null

type NormalizedLog = {
  id: string
  source: LogSource
  created_at: string
  sent_at: string | null
  channel: LogChannel
  status: string | null
  body: string | null
  subject: string | null
  recipient: string | null
  error: string | null
  client_id: string | null
  client_name: string | null
  campaign_id: string | null
  campaign_name: string | null
}

type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

type LogsResponse = {
  logs: NormalizedLog[]
  pagination: PaginationMeta
}

import type { Database } from '@/types/supabase'
type Salon = Database['public']['Tables']['salons']['Row']

type FilterState = {
  status: string
  from: string
  to: string
}

const PAGE_SIZE = 25
const ALL_STATUSES = '__all__'

const STATUS_OPTIONS: Record<LogSource, string[]> = {
  crm: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
  sms_direct: ['queued', 'sent', 'delivered', 'failed'],
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function truncateText(value: string | null, maxLength: number) {
  if (!value) {
    return '—'
  }

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength).trimEnd()}...`
}

function getChannelBadge(channel: LogChannel) {
  if (channel === 'sms') {
    return (
      <Badge variant="outline" className="border-blue-200 text-blue-700">
        SMS
      </Badge>
    )
  }

  if (channel === 'email') {
    return (
      <Badge variant="outline" className="border-purple-200 text-purple-700">
        Email
      </Badge>
    )
  }

  return <span className="text-muted-foreground">—</span>
}

function getStatusBadge(status: string | null) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>
  }

  const normalized = status.toLowerCase()

  if (normalized === 'sent' || normalized === 'delivered') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{status}</Badge>
  }

  if (normalized === 'failed' || normalized === 'bounced') {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{status}</Badge>
  }

  if (normalized === 'pending' || normalized === 'queued') {
    return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{status}</Badge>
  }

  return <Badge variant="secondary">{status}</Badge>
}

async function fetchLogs({
  salonId,
  source,
  filters,
  page,
}: {
  salonId: string
  source: LogSource
  filters: FilterState
  page: number
}) {
  const params = new URLSearchParams({
    salonId,
    source,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  })

  if (filters.status !== ALL_STATUSES) {
    params.set('status', filters.status)
  }

  if (filters.from) {
    params.set('from', new Date(`${filters.from}T00:00:00`).toISOString())
  }

  if (filters.to) {
    params.set('to', new Date(`${filters.to}T23:59:59`).toISOString())
  }

  const response = await fetch(`/api/notifications/logs?${params.toString()}`)

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || 'Nie udalo sie pobrac logow')
  }

  return (await response.json()) as LogsResponse
}

function TabContent({
  salonId,
  source,
  isSalonLoading,
}: {
  salonId: string
  source: LogSource
  isSalonLoading: boolean
}) {
  const [pendingFilters, setPendingFilters] = useState<FilterState>({
    status: ALL_STATUSES,
    from: '',
    to: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    status: ALL_STATUSES,
    from: '',
    to: '',
  })
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<NormalizedLog | null>(null)

  const logsQuery = useQuery({
    queryKey: ['notification-logs', salonId, source, appliedFilters, page],
    queryFn: () =>
      fetchLogs({
        salonId,
        source,
        filters: appliedFilters,
        page,
      }),
    enabled: !!salonId,
  })

  const logs = logsQuery.data?.logs ?? []
  const pagination = logsQuery.data?.pagination

  const handleApplyFilters = () => {
    setAppliedFilters(pendingFilters)
    setPage(1)
  }

  const handleResetFilters = () => {
    const resetFilters = {
      status: ALL_STATUSES,
      from: '',
      to: '',
    }

    setPendingFilters(resetFilters)
    setAppliedFilters(resetFilters)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-[minmax(0,220px)_minmax(0,180px)_minmax(0,180px)_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor={`${source}-status`}>Status</Label>
          <Select
            value={pendingFilters.status}
            onValueChange={(value) =>
              setPendingFilters((current) => ({
                ...current,
                status: value,
              }))
            }
          >
            <SelectTrigger id={`${source}-status`}>
              <SelectValue placeholder="Wybierz status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>Wszystkie</SelectItem>
              {STATUS_OPTIONS[source].map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${source}-from`}>Od</Label>
          <Input
            id={`${source}-from`}
            type="date"
            value={pendingFilters.from}
            onChange={(event) =>
              setPendingFilters((current) => ({
                ...current,
                from: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${source}-to`}>Do</Label>
          <Input
            id={`${source}-to`}
            type="date"
            value={pendingFilters.to}
            onChange={(event) =>
              setPendingFilters((current) => ({
                ...current,
                to: event.target.value,
              }))
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleApplyFilters}>Filtruj</Button>
          <Button variant="outline" onClick={handleResetFilters}>
            Resetuj
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Klient</TableHead>
              <TableHead>Kanał</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Treść</TableHead>
              {source === 'crm' && <TableHead>Kampania</TableHead>}
              <TableHead>Błąd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isSalonLoading || logsQuery.isLoading) &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`${source}-skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full max-w-xs" />
                  </TableCell>
                  {source === 'crm' && (
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                  )}
                  <TableCell>
                    <Skeleton className="h-4 w-full max-w-[200px]" />
                  </TableCell>
                </TableRow>
              ))}

            {!isSalonLoading && !logsQuery.isLoading && logsQuery.isError && (
              <TableRow>
                <TableCell
                  colSpan={source === 'crm' ? 7 : 6}
                  className="py-10 text-center text-sm text-red-600"
                >
                  {logsQuery.error instanceof Error ? logsQuery.error.message : 'Nie udalo sie pobrac logow'}
                </TableCell>
              </TableRow>
            )}

            {!isSalonLoading && !logsQuery.isLoading && !logsQuery.isError && logs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={source === 'crm' ? 7 : 6}
                  className="py-10 text-center text-muted-foreground"
                >
                  Brak logów dla wybranych filtrów
                </TableCell>
              </TableRow>
            )}

            {!isSalonLoading &&
              !logsQuery.isLoading &&
              !logsQuery.isError &&
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(log.created_at)}</TableCell>
                  <TableCell>{log.client_name || '—'}</TableCell>
                  <TableCell>{getChannelBadge(log.channel)}</TableCell>
                  <TableCell>{getStatusBadge(log.status)}</TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="block truncate" title={log.body || undefined}>
                        {truncateText(log.body, 60)}
                      </span>
                      {log.body && (
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Podgląd treści"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  {source === 'crm' && <TableCell>{log.campaign_name || '—'}</TableCell>}
                  <TableCell className="max-w-[220px] text-red-600">
                    {log.error ? (
                      <span className="block truncate" title={log.error}>
                        {truncateText(log.error, 50)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Strona {pagination?.page ?? page} z {pagination?.totalPages ?? 1} ({pagination?.total ?? 0} łącznie)
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={isSalonLoading || !pagination?.hasPreviousPage || logsQuery.isLoading}
          >
            Poprzednia
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage((current) => current + 1)}
            disabled={isSalonLoading || !pagination?.hasNextPage || logsQuery.isLoading}
          >
            Następna
          </Button>
        </div>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedLog?.channel === 'email' ? 'Treść emaila' : 'Treść SMS'}
              {selectedLog?.subject ? ` — ${selectedLog.subject}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {selectedLog?.client_name && (
              <p className="text-sm text-muted-foreground">
                Odbiorca: <span className="font-medium text-foreground">{selectedLog.client_name}</span>
                {selectedLog.recipient ? ` (${selectedLog.recipient})` : ''}
              </p>
            )}
            <pre className="max-h-[60vh] overflow-auto rounded border bg-muted p-4 text-sm whitespace-pre-wrap break-words">
              {selectedLog?.body ?? ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function NotificationLogsPage() {
  const params = useParams()
  const slug = params.slug as string

  const salonQuery = useQuery<Salon | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('salons').select('*').eq('slug', slug).single()

      if (error) {
        throw error
      }

      return data
    },
  })

  const salon = salonQuery.data
  const salonId = salon?.id ?? ''

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" className="w-fit px-0 hover:bg-transparent">
          <Link href={`/${slug}/settings/notifications`} className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Powrót
          </Link>
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Logi wysyłki</h1>
          <p className="text-muted-foreground">Historia wysłanych powiadomień z CRM i SMS bezpośrednich.</p>
        </div>
      </div>

      <Tabs defaultValue="crm" className="space-y-6">
        <TabsList>
          <TabsTrigger value="crm">CRM / Kampanie</TabsTrigger>
          <TabsTrigger value="sms_direct">SMS bezpośrednie</TabsTrigger>
        </TabsList>

        <TabsContent value="crm" forceMount>
          <TabContent salonId={salonId} source="crm" isSalonLoading={salonQuery.isLoading} />
        </TabsContent>

        <TabsContent value="sms_direct" forceMount>
          <TabContent salonId={salonId} source="sms_direct" isSalonLoading={salonQuery.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
