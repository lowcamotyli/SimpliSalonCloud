'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useIntegrations, useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { INTEGRATIONS } from '@/lib/types/settings'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ServiceImport } from '@/components/settings/service-import'
import { toast } from 'sonner'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']
type GmailSendStatus = {
  connected: boolean
}

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
  const { data: settings } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)
  const { data: gmailSendStatus } = useQuery<GmailSendStatus>({
    queryKey: ['gmail-send-status', salonId],
    enabled: Boolean(salonId),
    queryFn: async () => {
      const response = await fetch('/api/integrations/gmail-send?status=true', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch Gmail Send status')
      }

      return response.json() as Promise<GmailSendStatus>
    },
  })

  const [resendApiKey, setResendApiKey] = useState('')
  const [resendFromEmail, setResendFromEmail] = useState('')
  const [resendFromName, setResendFromName] = useState('')
  const [testEmailTo, setTestEmailTo] = useState('')
  const [isTestingEmail, setIsTestingEmail] = useState(false)

  useEffect(() => {
    if (!settings) return
    setResendFromEmail(settings.resend_from_email || '')
    setResendFromName(settings.resend_from_name || '')
    setResendApiKey('')
  }, [settings])

  if (!salon) return <div className="p-6">Ładowanie...</div>

  const isActive = (type: string) => {
    return activeIntegrations.some((i: any) => i.integration_type === type && i.is_active)
  }

  const handleSaveProviderSettings = () => {
    updateSettings.mutate({
      resend_api_key: resendApiKey || (settings?.has_resend_api_key ? '__UNCHANGED__' : ''),
      resend_from_email: resendFromEmail,
      resend_from_name: resendFromName,
    })
  }

  const handleTestEmail = async () => {
    if (!testEmailTo) {
      toast.error('Wpisz adres email testowy')
      return
    }

    setIsTestingEmail(true)
    try {
      const res = await fetch('/api/crm/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, to: testEmailTo }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Test email failed')
      toast.success('Wysłano testowy email')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Błąd testu email')
    } finally {
      setIsTestingEmail(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Integracje</h1>
        <p className="text-sm text-muted-foreground">Połącz zewnętrzne usługi i automatyzuj salon</p>
      </div>

      <div className="mt-8 space-y-12">

        {/* Sekcja: Komunikacja */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Wiadomości i Komunikacja</h2>
            <p className="text-sm text-muted-foreground">Skonfiguruj dostawców email oraz SMS dla powiadomień klientów.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* SMSAPI */}
            <SettingsCard
              title="SMSAPI (SMS)"
              description="Bramka SMS dla powiadomień"
              action={<Badge variant={settings?.has_smsapi_token ? "default" : "outline"}>{settings?.has_smsapi_token ? "Połączone" : "Dostępne"}</Badge>}
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">📱</div>
                <Link href={`/${slug}/settings/sms`}>
                  <Button variant={settings?.has_smsapi_token ? "outline" : "default"}>
                    {settings?.has_smsapi_token ? "Zarządzaj" : "Połącz"}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Gmail — wysyłanie e-maili"
              description="Wysyłaj e-maile przez własne konto Gmail"
              action={<Badge variant={gmailSendStatus?.connected ? "default" : "outline"}>{gmailSendStatus?.connected ? "Połączone" : "Dostępne"}</Badge>}
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">📨</div>
                <Link href={`/${slug}/settings/integrations/gmail-send`}>
                  <Button variant={gmailSendStatus?.connected ? "outline" : "default"}>
                    {gmailSendStatus?.connected ? "Zarządzaj" : "Połącz"}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </SettingsCard>

            {/* Twilio */}
            {INTEGRATIONS.filter(i => i.type === 'twilio').map(integration => {
              const connected = isActive(integration.type)
              return (
                <SettingsCard
                  key={integration.id}
                  title={integration.name}
                  description={integration.description}
                  action={connected ? <Badge variant="default">Połączone</Badge> : <Badge variant="outline">Dostępne</Badge>}
                >
                  <div className="flex items-center justify-between">
                    <integration.icon className="h-8 w-8 text-muted-foreground" />
                    <Button variant="outline" disabled>Wkrótce</Button>
                  </div>
                </SettingsCard>
              )
            })}

            {/* Resend */}
            <SettingsCard
              title="Resend (Email)"
              description="Dedykowany serwer pocztowy dla salonu"
              action={<Badge variant={settings?.has_resend_api_key ? "default" : "outline"}>{settings?.has_resend_api_key ? "Połączone" : "Dostępne"}</Badge>}
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">📧</div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant={settings?.has_resend_api_key ? "outline" : "default"}>
                      {settings?.has_resend_api_key ? "Zarządzaj" : "Połącz"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Konfiguracja Resend</DialogTitle>
                      <DialogDescription>
                        Ustaw dane logowania do serwera email, aby powiadomienia trafiały bezpośrednio z Twojej domeny.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="resend-api-key">API Key</Label>
                        <Input
                          id="resend-api-key"
                          type="password"
                          value={resendApiKey}
                          onChange={(e) => setResendApiKey(e.target.value)}
                          placeholder={settings?.has_resend_api_key ? '•••••••• (pozostaw puste aby nie zmieniać)' : 're_...'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resend-from-email">From Email</Label>
                        <Input
                          id="resend-from-email"
                          type="email"
                          value={resendFromEmail}
                          onChange={(e) => setResendFromEmail(e.target.value)}
                          placeholder="noreply@twojadomena.pl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="resend-from-name">From Name</Label>
                        <Input
                          id="resend-from-name"
                          value={resendFromName}
                          onChange={(e) => setResendFromName(e.target.value)}
                          placeholder="Nazwa salonu"
                        />
                      </div>

                      <div className="border-t pt-4 mt-2 space-y-4">
                        <div>
                          <Label className="text-muted-foreground">Opcjonalnie: Wyślij email testowy</Label>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            value={testEmailTo}
                            onChange={(e) => setTestEmailTo(e.target.value)}
                            placeholder="Adres testowy"
                          />
                          <Button variant="secondary" onClick={handleTestEmail} disabled={isTestingEmail || !salonId}>
                            {isTestingEmail ? 'Wysyłanie...' : 'Wyślij test'}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2 border-t">
                      <DialogTrigger asChild>
                        <Button onClick={handleSaveProviderSettings} disabled={updateSettings.isPending || !salonId}>
                          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz i zamknij'}
                        </Button>
                      </DialogTrigger>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </SettingsCard>
          </div>
        </section>

        <hr className="border-border" />

        {/* Sekcja: Płatności Online */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Płatności Online</h2>
            <p className="text-sm text-muted-foreground">Skonfiguruj bramkę płatności, aby przyjmować depozyty i płatności od klientów.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SettingsCard
              title="Przelewy24"
              description="Bramka płatności — karty, BLIK, przelew"
              action={
                <Badge
                  variant={settings?.has_p24_crc ? 'default' : 'outline'}
                  className={settings?.has_p24_crc ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : ''}
                >
                  {settings?.has_p24_crc ? 'Połączone' : 'Dostępne'}
                </Badge>
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-xl bg-red-600 flex items-center justify-center shadow-sm shrink-0">
                    <span className="text-white font-black text-sm">P</span>
                  </div>
                  <span className="font-bold text-foreground text-sm">
                    Przelewy<span className="text-red-600">24</span>
                  </span>
                </div>
                <Link href={`/${slug}/settings/integrations/przelewy24`}>
                  <Button variant={settings?.has_p24_crc ? 'outline' : 'default'}>
                    {settings?.has_p24_crc ? 'Zarządzaj' : 'Połącz'}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </SettingsCard>
          </div>
        </section>

        <hr className="border-border" />

        {/* Sekcja: Zewnętrzne integracje */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Platformy Rezerwacyjne</h2>
            <p className="text-sm text-muted-foreground">Połącz zewnętrzne platformy rezerwacyjne i synchronizuj dane z kalendarza.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {INTEGRATIONS.filter(i => i.type !== 'twilio' && i.type !== 'przelewy24').map(integration => {
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
                    <integration.icon className="h-8 w-8 text-muted-foreground" />

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
        </section>

        <hr className="border-border" />

        {/* Sekcja: Migracje */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Dane i Migracja</h2>
            <p className="text-sm text-muted-foreground">Pobierz szablony i zaimportuj dane z innych systemów bezpośrednio do SimpliSalon.</p>
          </div>
          <div>
            <ServiceImport />
          </div>
        </section>

      </div>
    </div>
  )
}
