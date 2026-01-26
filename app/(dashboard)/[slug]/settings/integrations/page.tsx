// app/(dashboard)/[slug]/settings/integrations/page.tsx
'use client'

import { useSalon } from '@/hooks/use-salon'
import { useIntegrations } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { INTEGRATIONS } from '@/lib/types/settings'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export default function IntegrationsPage({ params }: { params: { slug: string } }) {
  const { salon } = useSalon(params.slug)
  const { data: activeIntegrations = [] } = useIntegrations(salon?.id || '')

  if (!salon) return <div>Ładowanie...</div>

  const isActive = (type: string) => {
    return activeIntegrations.some((i: any) => i.integration_type === type && i.is_active)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Integracje</h1>
        <p className="text-muted-foreground">Połącz zewnętrzne usługi</p>
      </div>

      <SettingsNav baseUrl={`/${params.slug}/settings`} />

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
                  <Link href={`/${params.slug}${integration.config}`}>
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