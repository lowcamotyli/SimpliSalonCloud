'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { ThemeSelector } from '@/components/settings/theme-selector'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { ThemeKey } from '@/lib/types/settings'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export default function AppearancePage() {
  const params = useParams()
  const slug = params.slug as string

  const { data: salon } = useQuery({
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

  const { data: settings } = useSettings(salon?.id || '')
  const updateSettings = useUpdateSettings(salon?.id || '')

  const [theme, setTheme] = useState<ThemeKey>('beauty_salon')
  const [logoUrl, setLogoUrl] = useState('')

  useEffect(() => {
    if (settings) {
      setTheme(settings.theme)
      setLogoUrl(settings.logo_url || '')
    }
  }, [settings])

  if (!salon || !settings) return <div className="p-6">Ładowanie...</div>

  const handleSave = () => {
    updateSettings.mutate({ theme, logo_url: logoUrl })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wygląd (Ustawienia wizualne)</h1>
          <p className="text-muted-foreground">Personalizuj wygląd swojej aplikacji</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

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