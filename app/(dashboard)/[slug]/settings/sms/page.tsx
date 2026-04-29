'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SettingsCard } from '@/components/settings/settings-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSmsSettings, useUpdateSmsSettings } from '@/hooks/use-settings'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

type ReminderRule = {
  id?: string
  hours_before: number
  message_template: string
  require_confirmation: boolean
  target_blacklisted_only: boolean
  is_active: boolean
}

export default function SmsSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const { data: salon } = useQuery<SalonRow | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('salons').select('*').eq('slug', slug).single()
      if (error) throw error
      return data
    },
  })

  const salonId = salon?.id ?? ''
  const { data: smsSettings } = useSmsSettings(salonId)
  const updateSmsSettings = useUpdateSmsSettings(salonId)

  const [smsProvider, setSmsProvider] = useState<'smsapi' | 'bulkgate'>('smsapi')
  const [smsapiToken, setSmsapiToken] = useState('')
  const [smsapiSenderName, setSmsapiSenderName] = useState('')
  const [bulkgateAppId, setBulkgateAppId] = useState('')
  const [bulkgateAppToken, setBulkgateAppToken] = useState('')
  const [testSmsTo, setTestSmsTo] = useState('')
  const [isTestingSms, setIsTestingSms] = useState(false)
  const [rules, setRules] = useState<ReminderRule[]>([])

  useEffect(() => {
    if (!smsSettings) return
    setSmsProvider((smsSettings.sms_provider as 'smsapi' | 'bulkgate') || 'smsapi')
    setSmsapiSenderName(smsSettings.smsapi_sender_name || '')
    setBulkgateAppId(smsSettings.bulkgate_app_id || '')
    setSmsapiToken('')
    setBulkgateAppToken('')
    setRules(smsSettings.reminder_rules || [])
  }, [smsSettings])

  if (!salon) return <div className="p-6">Ładowanie...</div>

  const handleSave = () => {
    updateSmsSettings.mutate({
      sms_provider: smsProvider,
      smsapi_token: smsapiToken || (smsSettings?.has_smsapi_token ? '__UNCHANGED__' : ''),
      smsapi_sender_name: smsapiSenderName,
      bulkgate_app_id: bulkgateAppId,
      bulkgate_app_token: bulkgateAppToken || (smsSettings?.has_bulkgate_app_token ? '__UNCHANGED__' : ''),
      reminder_rules: rules,
    })
  }

  const handleTestSms = async () => {
    if (!testSmsTo) {
      toast.error('Wpisz numer telefonu testowego')
      return
    }

    setIsTestingSms(true)
    try {
      const res = await fetch('/api/settings/sms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, to: testSmsTo }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Test SMS failed')
      toast.success('Wysłano testowy SMS')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Błąd testu SMS')
    } finally {
      setIsTestingSms(false)
    }
  }

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      {
        hours_before: 24,
        message_template: 'Przypomnienie: {{clientName}}, wizyta {{date}} o {{time}}. {{confirmUrl}}',
        require_confirmation: true,
        target_blacklisted_only: false,
        is_active: true,
      },
    ])
  }

  const updateRule = (index: number, patch: Partial<ReminderRule>) => {
    setRules((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)))
  }

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, idx) => idx !== index))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-xl border border-border/70 bg-muted/20 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">SMS</h1>
        <p className="text-sm text-muted-foreground">Konfiguracja dostawcy i przypomnień SMS</p>
      </div>

      <SettingsCard title="Dostawca SMS" description="Wybór provider-a i dane dostępowe">
        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select value={smsProvider} onValueChange={(value) => setSmsProvider(value as 'smsapi' | 'bulkgate')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Wybierz dostawcę" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smsapi">SMSAPI</SelectItem>
                <SelectItem value="bulkgate">BulkGate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {smsProvider === 'smsapi' ? (
            <>
              <div>
                <Label htmlFor="smsapi-token">Token SMSAPI</Label>
                <Input
                  id="smsapi-token"
                  type="password"
                  value={smsapiToken}
                  onChange={(event) => setSmsapiToken(event.target.value)}
                  placeholder={smsSettings?.has_smsapi_token ? '•••••••• (bez zmian)' : 'token...'}
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="smsapi-sender-name">Nadawca</Label>
                <Input
                  id="smsapi-sender-name"
                  value={smsapiSenderName}
                  onChange={(event) => setSmsapiSenderName(event.target.value)}
                  placeholder="SalonPL"
                  maxLength={11}
                  className="w-full"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="bulkgate-app-id">BulkGate App ID</Label>
                <Input
                  id="bulkgate-app-id"
                  value={bulkgateAppId}
                  onChange={(event) => setBulkgateAppId(event.target.value)}
                  placeholder="app_id"
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="bulkgate-token">BulkGate App Token</Label>
                <Input
                  id="bulkgate-token"
                  type="password"
                  value={bulkgateAppToken}
                  onChange={(event) => setBulkgateAppToken(event.target.value)}
                  placeholder={smsSettings?.has_bulkgate_app_token ? '•••••••• (bez zmian)' : 'token...'}
                  className="w-full"
                />
              </div>
            </>
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>Własna integracja = SMS bez portfela.</strong> Po skonfigurowaniu tokena powyżej
            wiadomości są wysyłane bezpośrednio przez Twoje konto SMSAPI
            {smsProvider === 'bulkgate' ? '/BulkGate' : ''} — bez potrzeby doładowania portfela SMS
            w SimpliSalon.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              value={testSmsTo}
              onChange={(event) => setTestSmsTo(event.target.value)}
              placeholder="numer testowy, np. +48500600700"
              className="w-full"
            />
            <Button className="w-full sm:w-auto" variant="outline" onClick={handleTestSms} disabled={isTestingSms || !salonId}>
              {isTestingSms ? 'Wysyłanie...' : 'Wyślij test'}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Reguły przypomnień" description="Wysyłka automatycznych przypomnień przed wizytą">
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div key={`${rule.id || 'new'}-${index}`} className="rounded-md border p-4 sm:p-6 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Godzin przed wizytą</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.hours_before}
                    onChange={(event) => updateRule(index, { hours_before: Number(event.target.value || 1) })}
                    className="w-full"
                  />
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  <Button
                    variant={rule.is_active ? 'default' : 'outline'}
                    onClick={() => updateRule(index, { is_active: !rule.is_active })}
                  >
                    {rule.is_active ? 'Aktywna' : 'Nieaktywna'}
                  </Button>
                  <Button
                    variant={rule.target_blacklisted_only ? 'destructive' : 'outline'}
                    title="Gdy włączone, SMS wysyłany tylko do klientów na czarnej liście"
                    onClick={() => updateRule(index, { target_blacklisted_only: !rule.target_blacklisted_only })}
                  >
                    {rule.target_blacklisted_only ? 'Tylko blacklista' : 'Wszyscy klienci'}
                  </Button>
                  <Button variant="outline" onClick={() => removeRule(index)}>Usuń</Button>
                </div>
              </div>

              <div>
                <Label>Szablon</Label>
                <Input
                  value={rule.message_template}
                  onChange={(event) => updateRule(index, { message_template: event.target.value })}
                  placeholder="{{clientName}}, przypomnienie o wizycie {{date}} {{time}}"
                  className="w-full"
                />
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addRule}>+ Dodaj regułę</Button>
        </div>
      </SettingsCard>

      <div className="mt-6 flex justify-end">
        <Button className="w-full sm:w-auto" onClick={handleSave} disabled={updateSmsSettings.isPending || !salonId}>
          {updateSmsSettings.isPending ? 'Zapisywanie...' : 'Zapisz ustawienia SMS'}
        </Button>
      </div>
    </div>
  )
}
