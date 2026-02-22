'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Mail, CheckCircle, XCircle, RefreshCw, AlertTriangle,
  Calendar, User, Scissors, Bell, BarChart3, Clock,
  LogOut, Settings2, Info, ChevronRight, Loader2
} from 'lucide-react'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

interface BooksyStats {
  lastSyncAt: string | null
  syncStats: { total: number; success: number; errors: number }
  bookings: { total: number; scheduled: number; cancelled: number }
}

interface BooksyLog {
  id: string
  booking_date: string
  booking_time: string
  status: string
  created_at: string
  base_price: number
  clients: { full_name: string; phone: string } | null
  employees: { first_name: string; last_name: string } | null
  services: { name: string } | null
}

export default function BooksySettingsPage() {
  const params = useParams()
  const slug = params.slug as string
  const queryClient = useQueryClient()

  const { data: salon } = useQuery<SalonRow | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('slug', slug)
        .single()
      if (error) throw error
      return data
    }
  })

  const salonId = salon?.id ?? ''
  const { data: settings, isLoading: settingsLoading } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)

  const isConnected = !!settings?.booksy_enabled && !!settings?.booksy_gmail_email
  const gmailEmail = settings?.booksy_gmail_email || ''

  // Local state for editable settings
  const [syncInterval, setSyncInterval] = useState('15')
  const [senderFilter, setSenderFilter] = useState('noreply@booksy.com')
  const [autoCreateClients, setAutoCreateClients] = useState(true)
  const [autoCreateServices, setAutoCreateServices] = useState(false)
  const [notifyOnNew, setNotifyOnNew] = useState(false)
  const [notifyOnCancel, setNotifyOnCancel] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)

  // Sync local state from settings
  useEffect(() => {
    if (settings) {
      setSyncInterval(String(settings.booksy_sync_interval_minutes ?? 15))
      setSenderFilter(settings.booksy_sender_filter ?? 'noreply@booksy.com')
      setAutoCreateClients(settings.booksy_auto_create_clients ?? true)
      setAutoCreateServices(settings.booksy_auto_create_services ?? false)
      setNotifyOnNew(settings.booksy_notify_on_new ?? false)
      setNotifyOnCancel(settings.booksy_notify_on_cancel ?? false)
      setNotifyEmail(settings.booksy_notify_email ?? '')
      setSettingsDirty(false)
    }
  }, [settings])

  // Stats query
  const { data: stats, refetch: refetchStats } = useQuery<BooksyStats>({
    queryKey: ['booksy-stats', salonId],
    queryFn: async () => {
      const res = await fetch('/api/integrations/booksy/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: isConnected && !!salonId,
    refetchInterval: 60_000,
  })

  // Logs query
  const { data: logsData, refetch: refetchLogs } = useQuery<{ bookings: BooksyLog[] }>({
    queryKey: ['booksy-logs', salonId],
    queryFn: async () => {
      const res = await fetch('/api/integrations/booksy/logs')
      if (!res.ok) throw new Error('Failed to fetch logs')
      return res.json()
    },
    enabled: isConnected && !!salonId,
  })

  const handleConnectGmail = () => {
    window.location.href = '/api/integrations/booksy/auth'
  }

  const handleChangeAccount = () => {
    window.location.href = '/api/integrations/booksy/auth'
  }

  const handleDisconnect = async () => {
    if (!confirm('Czy na pewno chcesz odłączyć integrację Booksy? Istniejące rezerwacje nie zostaną usunięte.')) return
    setIsDisconnecting(true)
    try {
      const res = await fetch('/api/integrations/booksy/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Integracja Booksy została odłączona')
      queryClient.invalidateQueries({ queryKey: ['settings', salonId] })
    } catch (error: any) {
      toast.error('Błąd odłączania: ' + error.message)
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/integrations/booksy/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`Synchronizacja zakończona: ${data.successful} nowych, ${data.errors} błędów`)
        refetchStats()
        refetchLogs()
        queryClient.invalidateQueries({ queryKey: ['settings', salonId] })
      } else {
        toast.error('Błąd synchronizacji: ' + data.error)
      }
    } catch (error: any) {
      toast.error('Błąd: ' + error.message)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      await updateSettings.mutateAsync({
        booksy_sync_interval_minutes: parseInt(syncInterval),
        booksy_sender_filter: senderFilter,
        booksy_auto_create_clients: autoCreateClients,
        booksy_auto_create_services: autoCreateServices,
        booksy_notify_on_new: notifyOnNew,
        booksy_notify_on_cancel: notifyOnCancel,
        booksy_notify_email: notifyEmail || undefined,
      })
      setSettingsDirty(false)
    } catch {
      // error handled by hook
    }
  }

  const markDirty = () => setSettingsDirty(true)

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nigdy'
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const statusBadge = (status: string) => {
    if (status === 'scheduled') return <Badge variant="default" className="text-xs">Zaplanowana</Badge>
    if (status === 'cancelled') return <Badge variant="destructive" className="text-xs">Anulowana</Badge>
    if (status === 'completed') return <Badge variant="secondary" className="text-xs">Zakończona</Badge>
    return <Badge variant="outline" className="text-xs">{status}</Badge>
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integracja Booksy</h1>
          <p className="mt-1 text-muted-foreground">
            Automatyczna synchronizacja rezerwacji z Booksy przez Gmail
          </p>
        </div>
        <Badge
          variant={isConnected ? 'success' : 'secondary'}
          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-sm"
        >
          {isConnected
            ? <><CheckCircle className="h-4 w-4" /> Połączono</>
            : <><XCircle className="h-4 w-4" /> Nie połączono</>
          }
        </Badge>
      </div>

      {/* ── 1. STATUS POŁĄCZENIA ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5 text-blue-500" />
            Konto Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Połącz konto Gmail, z którego Booksy wysyła powiadomienia o rezerwacjach.
                System będzie automatycznie odczytywał te emaile i tworzył wizyty w kalendarzu.
              </p>
              <Button onClick={handleConnectGmail} className="gap-2">
                <Mail className="h-4 w-4" />
                Połącz z Gmail
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100">
                    <Mail className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{gmailEmail}</p>
                    <p className="text-xs text-gray-500">Połączone konto Gmail</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleChangeAccount}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Zmień konto
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="gap-1.5"
                >
                  {isDisconnecting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <LogOut className="h-3.5 w-3.5" />
                  }
                  Odłącz integrację
                </Button>
                <p className="text-xs text-gray-400">Istniejące rezerwacje nie zostaną usunięte</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. STATYSTYKI (tylko gdy połączono) ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                Statystyki synchronizacji
              </CardTitle>
              <Button
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
                className="gap-2"
              >
                {isSyncing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />
                }
                {isSyncing ? 'Synchronizuję...' : 'Synchronizuj teraz'}
              </Button>
            </div>
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Ostatnia synchronizacja: <span className="font-medium">{formatDate(stats?.lastSyncAt ?? null)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard
                label="Emaili przetworzonych"
                value={stats?.syncStats.total ?? 0}
                color="blue"
              />
              <StatCard
                label="Sukcesy"
                value={stats?.syncStats.success ?? 0}
                color="green"
              />
              <StatCard
                label="Błędy"
                value={stats?.syncStats.errors ?? 0}
                color="red"
              />
              <StatCard
                label="Rezerwacje z Booksy"
                value={stats?.bookings.total ?? 0}
                color="purple"
              />
              <StatCard
                label="Aktywne"
                value={stats?.bookings.scheduled ?? 0}
                color="emerald"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3. OPCJE SYNCHRONIZACJI (tylko gdy połączono) ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-5 w-5 text-orange-500" />
              Opcje synchronizacji
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Sender filter */}
            <div className="space-y-1.5">
              <Label htmlFor="sender-filter" className="text-sm font-medium">
                Adres e-mail nadawcy (Booksy)
              </Label>
              <p className="text-xs text-gray-500">
                Emaile z tego adresu będą pobierane i przetwarzane jako rezerwacje Booksy.
              </p>
              <Input
                id="sender-filter"
                value={senderFilter}
                onChange={e => { setSenderFilter(e.target.value); markDirty() }}
                placeholder="noreply@booksy.com"
                className="max-w-sm font-mono text-sm"
              />
            </div>

            <div className="border-t" />

            {/* Sync interval */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Interwał automatycznej synchronizacji</Label>
              <p className="text-xs text-gray-500">
                Jak często system sprawdza nowe emaile z Booksy.
              </p>
              <Select
                value={syncInterval}
                onValueChange={v => { setSyncInterval(v); markDirty() }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Co 5 minut</SelectItem>
                  <SelectItem value="15">Co 15 minut</SelectItem>
                  <SelectItem value="30">Co 30 minut</SelectItem>
                  <SelectItem value="60">Co godzinę</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t" />

            {/* Auto-create clients */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <Label className="text-sm font-medium">Auto-tworzenie klientów</Label>
                </div>
                <p className="text-xs text-gray-500 pl-6">
                  Jeśli klient z Booksy nie istnieje w systemie, zostanie automatycznie dodany.
                </p>
              </div>
              <Switch
                checked={autoCreateClients}
                onCheckedChange={v => { setAutoCreateClients(v); markDirty() }}
              />
            </div>

            {/* Auto-create services */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-gray-400" />
                  <Label className="text-sm font-medium">Auto-tworzenie usług</Label>
                </div>
                <p className="text-xs text-gray-500 pl-6">
                  Jeśli usługa z Booksy nie istnieje, zostanie automatycznie dodana.
                  {!autoCreateServices && (
                    <span className="block mt-0.5 text-amber-600 font-medium">
                      ⚠ Wyłączone — nieznane usługi spowodują błąd synchronizacji.
                    </span>
                  )}
                </p>
              </div>
              <Switch
                checked={autoCreateServices}
                onCheckedChange={v => { setAutoCreateServices(v); markDirty() }}
              />
            </div>

            {settingsDirty && (
              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveSettings} disabled={updateSettings.isPending} className="gap-2">
                  {updateSettings.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Zapisz ustawienia
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. POWIADOMIENIA (tylko gdy połączono) ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-violet-500" />
              Powiadomienia e-mail
            </CardTitle>
            <CardDescription className="text-xs">
              Otrzymuj powiadomienia gdy Booksy przetworzy nowe zdarzenie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Nowa rezerwacja</Label>
                <p className="text-xs text-gray-500">Powiadom gdy zostanie dodana nowa wizyta z Booksy</p>
              </div>
              <Switch
                checked={notifyOnNew}
                onCheckedChange={v => { setNotifyOnNew(v); markDirty() }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Anulowanie rezerwacji</Label>
                <p className="text-xs text-gray-500">Powiadom gdy klient anuluje wizytę przez Booksy</p>
              </div>
              <Switch
                checked={notifyOnCancel}
                onCheckedChange={v => { setNotifyOnCancel(v); markDirty() }}
              />
            </div>

            {(notifyOnNew || notifyOnCancel) && (
              <div className="space-y-1.5">
                <Label htmlFor="notify-email" className="text-sm font-medium">
                  Adres e-mail do powiadomień
                </Label>
                <Input
                  id="notify-email"
                  type="email"
                  value={notifyEmail}
                  onChange={e => { setNotifyEmail(e.target.value); markDirty() }}
                  placeholder="salon@example.com"
                  className="max-w-sm"
                />
              </div>
            )}

            {settingsDirty && (
              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveSettings} disabled={updateSettings.isPending} className="gap-2">
                  {updateSettings.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Zapisz ustawienia
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 5. OSTATNIE OPERACJE (tylko gdy połączono) ── */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-sky-500" />
                Ostatnie rezerwacje z Booksy
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchLogs()} className="gap-1.5 text-xs">
                <RefreshCw className="h-3 w-3" />
                Odśwież
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!logsData?.bookings?.length ? (
              <p className="text-sm text-gray-500 text-center py-6">
                Brak przetworzonych rezerwacji z Booksy
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="pb-2 text-left font-medium">Data wizyty</th>
                      <th className="pb-2 text-left font-medium">Klient</th>
                      <th className="pb-2 text-left font-medium">Usługa</th>
                      <th className="pb-2 text-left font-medium">Pracownik</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-right font-medium">Cena</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logsData.bookings.map(b => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-4 text-xs text-gray-600 whitespace-nowrap">
                          {b.booking_date} {b.booking_time}
                        </td>
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-gray-900">{b.clients?.full_name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{b.clients?.phone}</p>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-700">{b.services?.name ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-gray-700">
                          {b.employees ? `${b.employees.first_name} ${b.employees.last_name}` : '—'}
                        </td>
                        <td className="py-2.5 pr-4">{statusBadge(b.status)}</td>
                        <td className="py-2.5 text-right text-gray-700 whitespace-nowrap">
                          {b.base_price ? `${b.base_price.toFixed(2)} zł` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 6. JAK TO DZIAŁA ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-gray-400" />
            Jak działa integracja?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {[
            {
              step: '1',
              title: 'Połącz Gmail',
              desc: 'System uzyskuje dostęp do Twojej skrzynki Gmail, gdzie Booksy wysyła powiadomienia o rezerwacjach.'
            },
            {
              step: '2',
              title: 'Automatyczna synchronizacja',
              desc: 'System cyklicznie sprawdza nowe emaile z Booksy i automatycznie tworzy lub aktualizuje wizyty w kalendarzu.'
            },
            {
              step: '3',
              title: 'Obsługiwane akcje',
              items: ['Nowa rezerwacja — tworzy wizytę w kalendarzu', 'Zmiana terminu — aktualizuje istniejącą wizytę', 'Anulowanie — oznacza wizytę jako anulowaną']
            },
            {
              step: '4',
              title: 'Dopasowanie danych',
              items: ['Klientów po numerze telefonu (tworzy nowych jeśli włączone)', 'Pracowników po imieniu lub nazwisku', 'Usług po nazwie (tworzy nowe jeśli włączone)']
            },
          ].map(({ step, title, desc, items }) => (
            <div key={step} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                {step}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{title}</h4>
                {desc && <p className="mt-0.5 text-xs">{desc}</p>}
                {items && (
                  <ul className="mt-1 space-y-0.5">
                    {items.map(item => (
                      <li key={item} className="flex items-start gap-1.5 text-xs">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <div className={`rounded-lg p-3 ${colorMap[color] ?? 'bg-gray-50 text-gray-700'}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs opacity-80">{label}</p>
    </div>
  )
}
