'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import type { NotificationSettings } from '@/lib/types/settings'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type PreviewData = {
  type: string
  channel: 'sms' | 'email'
  body: string
  template: string | null
  hoursBefore?: number | null
}

type SalonRow = Database['public']['Tables']['salons']['Row']

export default function NotificationsPage() {
  const params = useParams()
  const slug = params.slug as string

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
  const { data: settings } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const handlePreview = async (type: string) => {
    if (!salonId) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch(`/api/notifications/preview?salonId=${salonId}&type=${type}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Błąd pobierania podglądu')
      setPreview(data as PreviewData)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Błąd')
      setPreview({ type, channel: 'sms', body: '', template: null })
    } finally {
      setPreviewLoading(false)
    }
  }

  const [notifications, setNotifications] = useState<NotificationSettings>({
    clientReminders: { enabled: false, timing: [24, 2], channels: ['sms', 'email'] },
    clientConfirmations: { enabled: false, channels: ['email'] },
    newBooking: { enabled: false, channels: ['email'] },
    cancellation: { enabled: false, channels: ['email'] },
    dailySummary: { enabled: false, time: '08:00', recipients: [] },
    surveys: { enabled: false },
    crmAutomations: { enabled: false },
    preAppointmentForms: { enabled: false },
    campaigns: { enabled: true },
  })

  useEffect(() => {
    if (settings?.notification_settings) {
      setNotifications(settings.notification_settings)
    }
  }, [settings])

  if (!salon || !settings) return <div className="p-6">Ładowanie...</div>

  const handleSave = () => {
    updateSettings.mutate({ notification_settings: notifications })
  }

  const updateNotification = (key: keyof NotificationSettings, updates: any) => {
    setNotifications(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates }
    }))
  }

  const toggleChannel = (
    key: 'clientReminders' | 'clientConfirmations' | 'newBooking' | 'cancellation',
    channel: string
  ) => {
    const current: string[] = notifications[key].channels || []
    const updated = current.includes(channel)
      ? current.filter((c: string) => c !== channel)
      : [...current, channel]

    updateNotification(key, { channels: updated })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Powiadomienia</h1>
          <p className="text-muted-foreground">Zarządzaj komunikacją z klientami</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${slug}/settings/notifications/logs`}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Logi wysyłki
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <SettingsCard
          title="Przypomnienia dla klientów"
          description="Automatyczne przypomnienia o wizytach"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="reminders">Włącz przypomnienia</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => handlePreview('reminder')}
                  disabled={previewLoading || !salonId}
                >
                  Podgląd szablonu
                </Button>
                <Switch
                  id="reminders"
                  checked={notifications.clientReminders.enabled}
                  onCheckedChange={(enabled) => updateNotification('clientReminders', { enabled })}
                />
              </div>
            </div>

            {notifications.clientReminders.enabled && (
              <>
                <div className="space-y-2">
                  <Label>Kanały komunikacji</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="rem-sms"
                        checked={notifications.clientReminders.channels.includes('sms')}
                        onCheckedChange={() => toggleChannel('clientReminders', 'sms')}
                      />
                      <Label htmlFor="rem-sms">SMS</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="rem-email"
                        checked={notifications.clientReminders.channels.includes('email')}
                        onCheckedChange={() => toggleChannel('clientReminders', 'email')}
                      />
                      <Label htmlFor="rem-email">Email</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Kiedy wysyłać</Label>
                  <p className="text-sm text-muted-foreground">
                    24 godziny przed i 2 godziny przed wizytą
                  </p>
                </div>
              </>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Potwierdzenia rezerwacji"
          description="Automatyczne potwierdzenia nowych wizyt"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="confirmations">Włącz potwierdzenia</Label>
              <Switch
                id="confirmations"
                checked={notifications.clientConfirmations.enabled}
                onCheckedChange={(enabled) => updateNotification('clientConfirmations', { enabled })}
              />
            </div>

            {notifications.clientConfirmations.enabled && (
              <div className="space-y-2">
                <Label>Kanały komunikacji</Label>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="conf-email"
                      checked={notifications.clientConfirmations.channels.includes('email')}
                      onCheckedChange={() => toggleChannel('clientConfirmations', 'email')}
                    />
                    <Label htmlFor="conf-email">Email</Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Powiadomienia dla zespołu"
          description="Informuj pracowników o ważnych wydarzeniach"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Nowa rezerwacja</Label>
                <p className="text-sm text-muted-foreground">Powiadom o nowych wizytach</p>
              </div>
              <Switch
                checked={notifications.newBooking.enabled}
                onCheckedChange={(enabled) => updateNotification('newBooking', { enabled })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Anulowanie wizyty</Label>
                <p className="text-sm text-muted-foreground">Powiadom o anulowanych wizytach</p>
              </div>
              <Switch
                checked={notifications.cancellation.enabled}
                onCheckedChange={(enabled) => updateNotification('cancellation', { enabled })}
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Dzienne podsumowanie"
          description="Codzienny raport z nadchodzących wizyt"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="daily">Włącz podsumowanie</Label>
              <Switch
                id="daily"
                checked={notifications.dailySummary.enabled}
                onCheckedChange={(enabled) => updateNotification('dailySummary', { enabled })}
              />
            </div>

            {notifications.dailySummary.enabled && (
              <div>
                <Label>Godzina wysyłki</Label>
                <p className="text-sm text-muted-foreground">Codziennie o 08:00</p>
              </div>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Ankiety po wizycie"
          description="SMS z linkiem do oceny wizyty — wysyłany 2 godziny po zakończeniu"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="surveys">Włącz ankiety</Label>
                <p className="text-sm text-muted-foreground">
                  Klient dostaje SMS z prośbą o ocenę. Wymaga aktywnej funkcji <strong>surveys</strong> na planie.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => handlePreview('survey')}
                  disabled={previewLoading || !salonId}
                >
                  Podgląd szablonu
                </Button>
                <Switch
                  id="surveys"
                  checked={notifications.surveys?.enabled ?? false}
                  onCheckedChange={(enabled) => updateNotification("surveys", { enabled })}
                />
              </div>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Formularz przed wizytą"
          description="SMS z linkiem do krótkiego formularza — wysyłany 24h przed wizytą"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="preAppointmentForms">Włącz formularze przed wizytą</Label>
                <p className="text-sm text-muted-foreground">
                  Klient dostaje SMS z linkiem do wypełnienia ankiety przed wizytą. Wymaga funkcji <strong>forms</strong> na planie.
                </p>
              </div>
              <Switch
                id="preAppointmentForms"
                checked={notifications.preAppointmentForms?.enabled ?? false}
                onCheckedChange={(enabled) => updateNotification("preAppointmentForms", { enabled })}
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Automatyzacje CRM"
          description="Cykliczne kampanie SMS/email wyzwalane zdarzeniami (brak wizyty, urodziny, liczba wizyt)"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="crmAutomations">Włącz automatyzacje</Label>
                <p className="text-sm text-muted-foreground">
                  Automatyczne wysyłki do klientów wg reguł z modułu CRM. Wyłącz aby wstrzymać wszystkie kampanie automatyczne.
                </p>
              </div>
              <Switch
                id="crmAutomations"
                checked={notifications.crmAutomations?.enabled ?? false}
                onCheckedChange={(enabled) => updateNotification("crmAutomations", { enabled })}
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Kampanie CRM"
          description="Ręczne i zaplanowane kampanie SMS/email wysyłane do segmentów klientów"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="campaigns">Włącz kampanie</Label>
                <p className="text-sm text-muted-foreground">
                  Zezwól na wysyłanie kampanii i wiadomości bezpośrednich z modułu CRM. Wyłącz aby zablokować wszystkie wysyłki kampanii.
                </p>
              </div>
              <Switch
                id="campaigns"
                checked={notifications.campaigns?.enabled ?? true}
                onCheckedChange={(enabled) => updateNotification("campaigns", { enabled })}
              />
            </div>
          </div>
        </SettingsCard>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) { setPreview(null); setPreviewError(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Podgląd szablonu
              {preview && (
                <Badge variant="outline" className={preview.channel === 'sms' ? 'border-blue-200 text-blue-700' : 'border-purple-200 text-purple-700'}>
                  {preview.channel === 'sms' ? 'SMS' : 'Email'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {previewError ? (
              <p className="text-sm text-red-600">{previewError}</p>
            ) : (
              <>
                {preview?.template && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Szablon</p>
                    <pre className="rounded border bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">{preview.template}</pre>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Przykładowa wiadomość</p>
                  <pre className="rounded border bg-background px-3 py-2 text-sm whitespace-pre-wrap">{preview?.body}</pre>
                </div>
                {preview?.hoursBefore != null && (
                  <p className="text-xs text-muted-foreground">Wysyłane {preview.hoursBefore}h przed wizytą</p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
