"use client"

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, SlidersHorizontal, UserPlus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export type BooksySyncOptionsValue = {
  booksy_sync_interval_minutes: number
  booksy_sender_filter: string
  booksy_sync_from_date: string
  booksy_auto_create_clients: boolean
  booksy_auto_create_services: boolean
}

type BooksySyncOptionsProps = {
  salonId: string
  initialSettings: BooksySyncOptionsValue
}

const SYNC_INTERVAL_OPTIONS = [
  { value: '5', label: 'Co 5 minut' },
  { value: '15', label: 'Co 15 minut' },
  { value: '30', label: 'Co 30 minut' },
  { value: '60', label: 'Co godzine' },
]

export function BooksySyncOptions({ salonId, initialSettings }: BooksySyncOptionsProps) {
  const [settings, setSettings] = useState<BooksySyncOptionsValue>(initialSettings)
  const [lastSavedSettings, setLastSavedSettings] = useState<BooksySyncOptionsValue>(initialSettings)
  const [isSaving, setIsSaving] = useState(false)

  const canSave = useMemo(() => settings.booksy_sender_filter.trim().length > 0, [settings.booksy_sender_filter])

  const saveSettings = (nextSettings: BooksySyncOptionsValue) => {
    const normalizedSettings = {
      ...nextSettings,
      booksy_sender_filter: nextSettings.booksy_sender_filter.trim(),
    }

    setSettings(normalizedSettings)

    setIsSaving(true)
    void fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salonId,
        ...normalizedSettings,
        ...(normalizedSettings.booksy_sync_from_date
          ? { booksy_sync_from_date: normalizedSettings.booksy_sync_from_date }
          : {}),
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Nie udalo sie zapisac ustawien Booksy')
        }

        setLastSavedSettings(normalizedSettings)
        toast.success('Ustawienia Booksy zapisane')
      })
      .catch((error) => {
        setSettings(lastSavedSettings)
        toast.error(error instanceof Error ? error.message : 'Nie udalo sie zapisac ustawien Booksy')
      })
      .finally(() => setIsSaving(false))
  }

  const updateSetting = <K extends keyof BooksySyncOptionsValue>(key: K, value: BooksySyncOptionsValue[K]) => {
    saveSettings({ ...settings, [key]: value })
  }

  const hasManualChanges =
    settings.booksy_sender_filter.trim() !== lastSavedSettings.booksy_sender_filter.trim() ||
    settings.booksy_sync_from_date !== lastSavedSettings.booksy_sync_from_date

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-5 w-5 text-orange-500" />
          Opcje synchronizacji
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="booksy-sender-filter">Adres e-mail nadawcy Booksy</Label>
            <Input
              id="booksy-sender-filter"
              value={settings.booksy_sender_filter}
              disabled={isSaving}
              onChange={(event) => setSettings({ ...settings, booksy_sender_filter: event.target.value })}
              onBlur={() => {
                if (canSave && settings.booksy_sender_filter !== lastSavedSettings.booksy_sender_filter) {
                  saveSettings(settings)
                }
              }}
              placeholder="@booksy.com"
            />
            <p className="text-xs text-muted-foreground">
              Użyj <code className="rounded bg-muted px-1 py-0.5 text-xs">@booksy.com</code> żeby dopasować wszystkich nadawców z tej domeny (noreply@, no-reply@ itp.).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booksy-sync-from-date">Synchronizuj maile od</Label>
            <Input
              id="booksy-sync-from-date"
              type="date"
              value={settings.booksy_sync_from_date}
              disabled={isSaving}
              onChange={(event) => setSettings({ ...settings, booksy_sync_from_date: event.target.value })}
              onBlur={() => {
                if (settings.booksy_sync_from_date !== lastSavedSettings.booksy_sync_from_date) {
                  saveSettings(settings)
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Starsze maile nie beda pobierane przy synchronizacji ani reconcile.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booksy-sync-interval">Interwal automatycznej synchronizacji</Label>
            <Select
              value={String(settings.booksy_sync_interval_minutes)}
              disabled={isSaving}
              onValueChange={(value) => updateSetting('booksy_sync_interval_minutes', Number(value))}
            >
              <SelectTrigger id="booksy-sync-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNC_INTERVAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Jak czesto system sprawdza nowe maile z Booksy.
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <UserPlus className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="booksy-auto-clients">Auto-tworzenie klientow</Label>
                <p className="text-xs text-muted-foreground">
                  Jesli klient z Booksy nie istnieje w systemie, zostanie automatycznie dodany.
                </p>
              </div>
            </div>
            <Switch
              id="booksy-auto-clients"
              checked={settings.booksy_auto_create_clients}
              disabled={isSaving}
              onCheckedChange={(checked) => updateSetting('booksy_auto_create_clients', checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="booksy-auto-services">Auto-tworzenie uslug</Label>
                <p className="text-xs text-muted-foreground">
                  Jesli usluga z Booksy nie istnieje, system utworzy ja automatycznie.
                </p>
              </div>
            </div>
            <Switch
              id="booksy-auto-services"
              checked={settings.booksy_auto_create_services}
              disabled={isSaving}
              onCheckedChange={(checked) => updateSetting('booksy_auto_create_services', checked)}
            />
          </div>
        </div>

        {isSaving ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Zapisywanie ustawien...
          </div>
        ) : null}

        {hasManualChanges ? (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={isSaving || !canSave}
              onClick={() => saveSettings(settings)}
            >
              Zapisz
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
