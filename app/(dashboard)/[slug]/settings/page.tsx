// app/(dashboard)/[slug]/settings/page.tsx
'use client'

import { useSalon } from '@/hooks/use-salon'
import { useSettings, useIntegrations } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Palette, Building2, Bell, Link as LinkIcon, CheckCircle, Circle } from 'lucide-react'
import Link from 'next/link'
import { THEMES } from '@/lib/types/settings'

export default function SettingsPage({ params }: { params: { slug: string } }) {
  const { salon } = useSalon(params.slug)
  const { data: settings } = useSettings(salon?.id || '')
  const { data: integrations = [] } = useIntegrations(salon?.id || '')

  if (!salon || !settings) return <div>Ładowanie...</div>

  const baseUrl = `/${params.slug}/settings`
  const activeIntegrations = integrations.filter((i: any) => i.is_active).length
  const theme = THEMES[settings.theme]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ustawienia</h1>
        <p className="text-muted-foreground">Zarządzaj konfiguracją salonu</p>
      </div>

      <SettingsNav baseUrl={baseUrl} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href={`${baseUrl}/appearance`}>
          <SettingsCard
            title="Wygląd"
            description="Motywy i branding"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                <Palette className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-medium">{theme.name}</p>
                <p className="text-sm text-muted-foreground">Aktywny motyw</p>
              </div>
            </div>
          </SettingsCard>
        </Link>

        <Link href={`${baseUrl}/business`}>
          <SettingsCard
            title="Informacje o biznesie"
            description="Dane kontaktowe i godziny"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">{salon.name}</p>
                <p className="text-sm text-muted-foreground">
                  {settings.contact_email || 'Uzupełnij dane'}
                </p>
              </div>
            </div>
          </SettingsCard>
        </Link>

        <Link href={`${baseUrl}/integrations`}>
          <SettingsCard
            title="Integracje"
            description="Połączone usługi"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <LinkIcon className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-medium">{activeIntegrations} aktywnych</p>
                <p className="text-sm text-muted-foreground">z 4 dostępnych</p>
              </div>
            </div>
          </SettingsCard>
        </Link>

        <Link href={`${baseUrl}/notifications`}>
          <SettingsCard
            title="Powiadomienia"
            description="SMS i email"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <Bell className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="font-medium">
                  {settings.notification_settings.clientReminders.enabled ? 'Włączone' : 'Wyłączone'}
                </p>
                <p className="text-sm text-muted-foreground">Przypomnienia dla klientów</p>
              </div>
            </div>
          </SettingsCard>
        </Link>
      </div>
    </div>
  )
}