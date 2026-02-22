'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import type { NotificationSettings } from '@/lib/types/settings'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

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
  
  const [notifications, setNotifications] = useState<NotificationSettings>({
    clientReminders: { enabled: true, timing: [24, 2], channels: ['sms', 'email'] },
    clientConfirmations: { enabled: true, channels: ['email'] },
    newBooking: { enabled: true, channels: ['email'] },
    cancellation: { enabled: true, channels: ['email'] },
    dailySummary: { enabled: false, time: '08:00', recipients: [] }
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
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

      <div className="space-y-6">
        <SettingsCard 
          title="Przypomnienia dla klientów"
          description="Automatyczne przypomnienia o wizytach"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="reminders">Włącz przypomnienia</Label>
              <Switch
                id="reminders"
                checked={notifications.clientReminders.enabled}
                onCheckedChange={(enabled) => updateNotification('clientReminders', { enabled })}
              />
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
      </div>
    </div>
  )
}
