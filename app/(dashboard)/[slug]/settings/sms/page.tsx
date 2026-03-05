'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { SettingsNav } from '@/components/settings/settings-nav'
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">SMS</h1>
        <p className="text-muted-foreground">Konfiguracja dostawcy i przypomnień SMS</p>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

      <SettingsCard title="Dostawca SMS" description="Wybór provider-a i dane dostępowe">
        <div className="space-y-4">
          <div>
            <Label>Provider</Label>
            <Select value={smsProvider} onValueChange={(value) => setSmsProvider(value as 'smsapi' | 'bulkgate')}>
              <SelectTrigger>
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
                />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Input
              value={testSmsTo}
              onChange={(event) => setTestSmsTo(event.target.value)}
              placeholder="numer testowy, np. +48500600700"
            />
            <Button variant="outline" onClick={handleTestSms} disabled={isTestingSms || !salonId}>
              {isTestingSms ? 'Wysyłanie...' : 'Wyślij test'}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Reguły przypomnień" description="Wysyłka automatycznych przypomnień przed wizytą">
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div key={`${rule.id || 'new'}-${index}`} className="rounded-md border p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label>Godzin przed wizytą</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.hours_before}
                    onChange={(event) => updateRule(index, { hours_before: Number(event.target.value || 1) })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant={rule.is_active ? 'default' : 'outline'}
                    onClick={() => updateRule(index, { is_active: !rule.is_active })}
                  >
                    {rule.is_active ? 'Aktywna' : 'Nieaktywna'}
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
                />
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addRule}>+ Dodaj regułę</Button>
        </div>
      </SettingsCard>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={updateSmsSettings.isPending || !salonId}>
          {updateSmsSettings.isPending ? 'Zapisywanie...' : 'Zapisz ustawienia SMS'}
        </Button>
      </div>
    </div>
  )
}
