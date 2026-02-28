'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare,
  Mail,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
  RefreshCw,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// --- Types ---

interface MessageLog {
  id: string
  created_at: string
  sent_at: string | null
  channel: 'email' | 'sms'
  subject: string | null
  body: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
  client_id: string | null
  campaign_id: string | null
  recipient: string
  error: string | null
  clients: { full_name: string } | null
  crm_campaigns: { name: string } | null
}

interface LogsResponse {
  logs: MessageLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// --- Sub-components ---

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Oczekuje',    cls: 'bg-slate-100 text-slate-600' },
    sent:      { label: 'Wysłane',     cls: 'bg-blue-100 text-blue-600' },
    delivered: { label: 'Dostarczone', cls: 'bg-emerald-100 text-emerald-700' },
    failed:    { label: 'Błąd',        cls: 'bg-red-100 text-red-600' },
    bounced:   { label: 'Odrzucone',   cls: 'bg-orange-100 text-orange-600' },
  }
  const config = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }

  return (
    <Badge variant="secondary" className={cn('font-medium border-none', config.cls)}>
      {config.label}
    </Badge>
  )
}

function ChannelBadge({ channel }: { channel: 'email' | 'sms' }) {
  if (channel === 'email') {
    return (
      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-none flex items-center gap-1 w-fit">
        <Mail className="w-3 h-3" />
        Email
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none flex items-center gap-1 w-fit">
      <MessageSquare className="w-3 h-3" />
      SMS
    </Badge>
  )
}

// --- Page ---

export default function MessageHistoryPage() {
  const params = useParams()
  const slug = params.slug as string

  const [page, setPage] = useState(1)
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'>('all')

  const { data: salon } = useQuery<{ id: string; slug: string } | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('salons').select('id, slug').eq('slug', slug).single()
      if (error) throw error
      return data
    },
  })
  const salonId = salon?.id || ''

  const { data, isLoading, error, refetch, isPlaceholderData } = useQuery<LogsResponse>({
    queryKey: ['crm-message-logs', salonId, page, channelFilter, statusFilter],
    queryFn: async () => {
      const urlParams = new URLSearchParams({ salonId, page: String(page), pageSize: '25' })
      if (channelFilter !== 'all') urlParams.set('channel', channelFilter)
      if (statusFilter !== 'all') urlParams.set('status', statusFilter)

      const res = await fetch(`/api/crm/logs?${urlParams.toString()}`)
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        const err = Object.assign(new Error(payload?.error || 'Błąd pobierania historii'), {
          status: res.status,
          upgradeUrl: payload?.upgradeUrl as string | undefined,
        })
        throw err
      }
      return payload
    },
    enabled: !!salonId,
    retry: false,
    placeholderData: (prev) => prev,
  })

  const handleChannelChange = (val: string) => {
    setChannelFilter(val as typeof channelFilter)
    setPage(1)
  }

  const handleStatusChange = (val: string) => {
    setStatusFilter(val as typeof statusFilter)
    setPage(1)
  }

  // --- 403 Locked ---
  if (error && (error as any).status === 403) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-0 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Historia wiadomości</h1>
          <p className="text-muted-foreground">Przeglądaj wysłane komunikaty CRM ze statusami dostarczenia.</p>
        </div>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Funkcja niedostępna w obecnym planie</h2>
            <p className="text-muted-foreground max-w-md mb-8">
              {error.message || 'Twoja subskrypcja nie obejmuje dostępu do historii wiadomości CRM.'}
            </p>
            <Button asChild className="gradient-button h-11 px-8 rounded-xl font-medium">
              <Link href={(error as any).upgradeUrl || `/${slug}/billing`}>
                Ulepsz plan
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Historia wiadomości</h1>
          <p className="text-muted-foreground">Przeglądaj wysłane komunikaty CRM ze statusami dostarczenia.</p>
        </div>
        {data && (
          <Badge variant="outline" className="h-7 px-3 text-xs text-muted-foreground bg-white border-slate-100 shadow-sm w-fit">
            {data.pagination.total} wiadomości
          </Badge>
        )}
      </div>

      {/* Filter bar */}
      <Card className="p-4 glass border-none shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Select value={channelFilter} onValueChange={handleChannelChange}>
            <SelectTrigger className="bg-white border-slate-100 rounded-lg w-full sm:w-48">
              <SelectValue placeholder="Kanał" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie kanały</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="bg-white border-slate-100 rounded-lg w-full sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              <SelectItem value="pending">Oczekujące</SelectItem>
              <SelectItem value="sent">Wysłane</SelectItem>
              <SelectItem value="delivered">Dostarczone</SelectItem>
              <SelectItem value="failed">Błąd</SelectItem>
              <SelectItem value="bounced">Odrzucone</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="rounded-lg bg-white border-slate-100 sm:ml-auto"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-none shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-6 py-3 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-2">Data</div>
          <div className="col-span-3">Odbiorca</div>
          <div className="col-span-3">Temat / Treść</div>
          <div className="col-span-1 text-center">Kanał</div>
          <div className="col-span-1">Kampania</div>
          <div className="col-span-2 text-right">Status</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-50">
          {isLoading && !data ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-4">
                <div className="h-6 bg-muted/20 rounded-xl animate-pulse w-full" />
              </div>
            ))
          ) : data?.logs.length === 0 ? (
            <div className="py-20 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-900 font-medium">Brak wiadomości</p>
              <p className="text-slate-400 text-sm max-w-xs mt-1">
                Nie znaleziono wiadomości spełniających kryteria filtrów.
              </p>
            </div>
          ) : (
            data?.logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  'grid grid-cols-1 md:grid-cols-12 gap-2 px-6 py-4 hover:bg-slate-50/30 transition-colors items-center text-sm',
                  isPlaceholderData && 'opacity-60'
                )}
              >
                {/* Data */}
                <div className="col-span-2 text-slate-600 text-xs">
                  {new Date(log.created_at).toLocaleString('pl-PL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </div>

                {/* Odbiorca */}
                <div className="col-span-3">
                  <p className="font-medium text-slate-900 truncate">
                    {log.clients?.full_name ?? log.recipient}
                  </p>
                  {log.clients && (
                    <p className="text-[11px] text-muted-foreground truncate">{log.recipient}</p>
                  )}
                </div>

                {/* Temat / Treść */}
                <div className="col-span-3 text-slate-500 truncate">
                  {log.channel === 'email' && log.subject ? (
                    <span className="font-medium text-slate-700">{log.subject}</span>
                  ) : (
                    log.body.length > 60 ? `${log.body.slice(0, 60)}…` : log.body
                  )}
                </div>

                {/* Kanał */}
                <div className="col-span-1 flex md:justify-center">
                  <ChannelBadge channel={log.channel} />
                </div>

                {/* Kampania */}
                <div className="col-span-1">
                  <span className="text-xs text-muted-foreground truncate block">
                    {log.crm_campaigns?.name ?? '—'}
                  </span>
                </div>

                {/* Status */}
                <div className="col-span-2 flex md:justify-end">
                  <StatusBadge status={log.status} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50/30 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Strona{' '}
              <span className="text-slate-700 font-medium">{data.pagination.page}</span>
              {' '}z{' '}
              <span className="text-slate-700 font-medium">{data.pagination.totalPages}</span>
              {' '}({data.pagination.total} łącznie)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg bg-white border-slate-200"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data.pagination.hasPreviousPage || isPlaceholderData}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg bg-white border-slate-200"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.pagination.hasNextPage || isPlaceholderData}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Generic error (non-403) */}
      {error && (error as any).status !== 403 && (
        <Card className="border-red-100 bg-red-50/50">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error.message}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 bg-white border-red-200 text-red-700 shrink-0"
              onClick={() => refetch()}
            >
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
