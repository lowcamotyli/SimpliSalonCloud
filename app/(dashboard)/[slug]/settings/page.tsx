'use client'

import { useParams } from 'next/navigation'
import { useSettings, useIntegrations } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Palette, Building2, Bell, Link as LinkIcon, CheckCircle, Circle, Upload } from 'lucide-react'
import Link from 'next/link'
import { THEMES } from '@/lib/types/settings'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

export default function SettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  // Get salon from database
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
  const { data: integrations = [] } = useIntegrations(salonId)

  if (!salon || !settings) return <div className="p-6">Ładowanie...</div>

  const baseUrl = `/${slug}/settings`
  const activeIntegrations = integrations.filter((i: any) => i.is_active).length
  const theme = THEMES[settings.theme] || THEMES.beauty_salon

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Ustawienia
          </h1>
          <p className="text-muted-foreground text-base font-medium">Zarządzaj konfiguracją salonu</p>
        </div>
      </div>

      <SettingsNav baseUrl={baseUrl} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href={`${baseUrl}/appearance`}>
          <SettingsCard
            title="Wygląd"
            description="Motywy i branding"
          >
            <div className="flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: theme.primary }}
              >
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

        <Link href={`${baseUrl}/import`}>
          <SettingsCard
            title="Import danych"
            description="Migracja rezerwacji"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-violet-100 flex items-center justify-center">
                <Upload className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="font-medium">Import CSV</p>
                <p className="text-sm text-muted-foreground">Z Booksy, Versum i innych</p>
              </div>
            </div>
          </SettingsCard>
        </Link>
      </div>
    </div>
  )
}
