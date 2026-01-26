// app/(dashboard)/[slug]/settings/appearance/page.tsx
'use client'

import { useState } from 'react'
import { useSalon } from '@/hooks/use-salon'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { ThemeSelector } from '@/components/settings/theme-selector'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { ThemeKey } from '@/lib/types/settings'

export default function AppearancePage({ params }: { params: { slug: string } }) {
  const { salon } = useSalon(params.slug)
  const { data: settings } = useSettings(salon?.id || '')
  const updateSettings = useUpdateSettings(salon?.id || '')
  
  const [theme, setTheme] = useState<ThemeKey>(settings?.theme || 'beauty_salon')
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url || '')

  if (!salon || !settings) return <div>Ładowanie...</div>

  const handleSave = () => {
    updateSettings.mutate({ theme, logo_url: logoUrl })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wygląd</h1>
          <p className="text-muted-foreground">Personalizuj wygląd aplikacji</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <SettingsNav baseUrl={`/${params.slug}/settings`} />

      <div className="space-y-6">
        <SettingsCard title="Motyw" description="Wybierz predefiniowany motyw">
          <ThemeSelector selected={theme} onChange={setTheme} />
        </SettingsCard>

        <SettingsCard title="Logo" description="Dodaj logo swojego salonu">
          <div className="space-y-4">
            <div>
              <Label htmlFor="logo">URL Logo</Label>
              <Input
                id="logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
            {logoUrl && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <img src={logoUrl} alt="Logo preview" className="h-16 object-contain" />
              </div>
            )}
          </div>
        </SettingsCard>
      </div>
    </div>
  )
}