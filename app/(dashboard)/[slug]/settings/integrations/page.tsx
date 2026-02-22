'use client'

import { useParams } from 'next/navigation'
import { useIntegrations } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { INTEGRATIONS } from '@/lib/types/settings'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ServiceImport } from '@/components/settings/service-import'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

export default function IntegrationsPage() {
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
  const { data: activeIntegrations = [] } = useIntegrations(salonId)

  if (!salon) return <div className="p-6">Ładowanie...</div>

  const isActive = (type: string) => {
    return activeIntegrations.some((i: any) => i.integration_type === type && i.is_active)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Integracje</h1>
        <p className="text-muted-foreground">Połącz zewnętrzne usługi</p>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

      <div className="mb-8">
        <ServiceImport />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {INTEGRATIONS.map(integration => {
          const connected = isActive(integration.type)

          return (
            <SettingsCard
              key={integration.id}
              title={integration.name}
              description={integration.description}
              action={
                connected ? (
                  <Badge variant="default">Połączone</Badge>
                ) : (
                  <Badge variant="outline">Dostępne</Badge>
                )
              }
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">{integration.icon}</div>

                {integration.config ? (
                  <Link href={`/${slug}${integration.config}`}>
                    <Button variant={connected ? "outline" : "default"}>
                      {connected ? 'Zarządzaj' : 'Połącz'}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" disabled>
                    Wkrótce
                  </Button>
                )}
              </div>
            </SettingsCard>
          )
        })}
      </div>
    </div>
  )
}
