'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LuxeThemePreview } from '@/components/settings/luxe-theme-preview'
import { SettingsCard } from '@/components/settings/settings-card'
import { ThemeSelector } from '@/components/settings/theme-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { createClient } from '@/lib/supabase/client'
import type { ThemeKey } from '@/lib/types/settings'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

export default function AppearancePage() {
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
    },
  })

  const salonId = salon?.id ?? ''
  const { data: settings } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)

  const [theme, setTheme] = useState<ThemeKey>('beauty_salon')
  const [logoUrl, setLogoUrl] = useState('')
  const isTestTheme = theme === 'auto_service'

  useEffect(() => {
    if (!settings) return
    setTheme(settings.theme)
    setLogoUrl(settings.logo_url || '')
  }, [settings])

  if (!salon || !settings) {
    return <div className="p-6">Ladowanie...</div>
  }

  const handleSave = () => {
    updateSettings.mutate({ theme, logo_url: logoUrl })
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Wyglad</h1>
          <p className="text-muted-foreground">Sprawdzaj nowe kierunki wizualne w dedykowanym slocie testowym.</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <div className="space-y-6">
        <SettingsCard title="Motyw salonu" description="Wybierz kolorystyke aplikacji.">
          <ThemeSelector selected={theme} onChange={setTheme} />
        </SettingsCard>

        {isTestTheme && <LuxeThemePreview />}

        <SettingsCard title="Logo" description="Dodaj logo swojego salonu">
          <div className="space-y-4">
            <div>
              <Label htmlFor="logo">URL logo</Label>
              <Input
                id="logo"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>

            {logoUrl && (
              <div className="relative flex h-24 w-full items-center justify-center rounded-lg border bg-muted/50 p-4">
                <Image
                  src={logoUrl}
                  alt="Logo preview"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            )}
          </div>
        </SettingsCard>
      </div>
    </div>
  )
}
