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
import { useSmsSettings, useUpdateSmsSettings } from '@/hooks/use-settings'
import type { Database } from '@/types/supabase'

type SalonRow = Database['public']['Tables']['salons']['Row']

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

  const [smsapiToken, setSmsapiToken] = useState('')
  const [smsapiSenderName, setSmsapiSenderName] = useState('')
  const [testSmsTo, setTestSmsTo] = useState('')
  const [isTestingSms, setIsTestingSms] = useState(false)

  useEffect(() => {
    if (!smsSettings) return
    setSmsapiSenderName(smsSettings.smsapi_sender_name || '')
    setSmsapiToken('')
  }, [smsSettings])

  if (!salon) return <div className="p-6">Ładowanie...</div>

  const handleSave = () => {
    updateSmsSettings.mutate({
      smsapi_token: smsapiToken || (smsSettings?.has_smsapi_token ? '__UNCHANGED__' : ''),
      smsapi_sender_name: smsapiSenderName,
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">SMS</h1>
        <p className="text-muted-foreground">Dedykowana konfiguracja SMSAPI</p>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

      <SettingsCard title="SMSAPI" description="Konfiguracja dostawcy SMS i test wysyłki">
        <div className="space-y-4">
          <div>
            <Label htmlFor="smsapi-token">Token</Label>
            <Input
              id="smsapi-token"
              type="password"
              value={smsapiToken}
              onChange={(e) => setSmsapiToken(e.target.value)}
              placeholder={smsSettings?.has_smsapi_token ? '•••••••• (pozostaw puste aby nie zmieniać)' : 'token...'}
            />
          </div>

          <div>
            <Label htmlFor="smsapi-sender-name">Sender Name</Label>
            <Input
              id="smsapi-sender-name"
              value={smsapiSenderName}
              onChange={(e) => setSmsapiSenderName(e.target.value)}
              placeholder="SalonPL"
              maxLength={11}
            />
          </div>

          <div className="flex gap-2">
            <Input
              value={testSmsTo}
              onChange={(e) => setTestSmsTo(e.target.value)}
              placeholder="numer testowy, np. 500600700"
            />
            <Button variant="outline" onClick={handleTestSms} disabled={isTestingSms || !salonId}>
              {isTestingSms ? 'Wysyłanie...' : 'Wyślij test'}
            </Button>
          </div>
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

