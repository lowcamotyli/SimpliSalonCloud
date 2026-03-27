'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { createClient } from '@/lib/supabase/client'

interface GmailStatus {
  connected: boolean
  email: string | null
  email_provider: string | null
}

interface GmailAuthResponse {
  authUrl: string
}

type EmailProvider = 'resend' | 'gmail'

export default function GmailSendSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  const [salonId, setSalonId] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchSalonId = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salons')
        .select('id')
        .eq('slug', slug)
        .single()

      if (error) throw error

      setSalonId(data.id)
    } catch (error) {
      console.error(error)
      console.log('Nie udało się pobrać salonu dla integracji Gmail Send')
    }
  }

  const fetchUserEmail = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setUserEmail(user?.email ?? null)
    } catch (error) {
      console.error(error)
      setUserEmail(null)
    }
  }

  const fetchStatus = async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/integrations/gmail-send?status=true', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udało się pobrać statusu integracji')
      }

      const data: GmailStatus = await response.json()
      setStatus(data)
    } catch (error) {
      console.error(error)
      console.log('Nie udało się pobrać statusu integracji Gmail Send')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSalonId()
    void fetchUserEmail()
    void fetchStatus()
  }, [slug])

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/integrations/gmail-send', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udało się rozpocząć połączenia z Gmail')
      }

      const data: GmailAuthResponse = await response.json()
      window.location.href = data.authUrl
    } catch (error) {
      console.error(error)
      console.log('Nie udało się rozpocząć połączenia z Gmail')
    }
  }

  const handleDisconnect = async () => {
    setSaving(true)

    try {
      const response = await fetch('/api/integrations/gmail-send', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udało się odłączyć konta Gmail')
      }

      console.log('Konto Gmail zostało odłączone')
      await fetchStatus()
    } catch (error) {
      console.error(error)
      console.log('Nie udało się odłączyć konta Gmail')
    } finally {
      setSaving(false)
    }
  }

  const handleProviderChange = async (value: string) => {
    if (!status?.connected) return

    const nextProvider = value as EmailProvider

    setSaving(true)

    try {
      if (!salonId) {
        throw new Error('Brak salonId')
      }

      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          salonId,
          email_provider: nextProvider,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udało się zapisać dostawcy e-mail')
      }

      setStatus(current => current ? { ...current, email_provider: nextProvider } : current)
      console.log('Dostawca e-mail został zapisany')
    } catch (error) {
      console.error(error)
      console.log('Nie udało się zapisać dostawcy e-mail')
    } finally {
      setSaving(false)
    }
  }

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true)
    setTestEmailResult(null)

    try {
      const response = await fetch('/api/integrations/gmail-send/test', {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udało się wysłać testowego e-maila')
      }

      const email = userEmail ?? status?.email ?? ''
      setTestEmailResult({
        type: 'success',
        message: `Email wysłany na ${email}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wysłać testowego e-maila'
      setTestEmailResult({
        type: 'error',
        message,
      })
    } finally {
      setSendingTestEmail(false)
    }
  }

  const currentProvider: EmailProvider = status?.email_provider === 'gmail' ? 'gmail' : 'resend'

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground">Gmail — wysyłanie e-maili</h1>
        <p className="text-muted-foreground">
          Wysyłaj powiadomienia e-mail przez własne konto Gmail zamiast domyślnego Resend.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status połączenia</CardTitle>
          <CardDescription>Połącz konto Gmail, aby wysyłać wiadomości z własnego adresu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Ładowanie statusu połączenia...</div>
          ) : status?.connected ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <Badge className="w-fit bg-green-100 text-green-800 hover:bg-green-100">
                    Połączono
                  </Badge>
                  <p className="text-sm font-medium text-foreground">{status.email}</p>
                  <Button variant="outline" onClick={handleSendTestEmail} disabled={sendingTestEmail}>
                    {sendingTestEmail ? 'Wysyłanie...' : 'Wyślij testowy email'}
                  </Button>
                  {testEmailResult?.type === 'success' && (
                    <p className="text-sm text-green-600">{testEmailResult.message}</p>
                  )}
                  {testEmailResult?.type === 'error' && (
                    <p className="text-sm text-red-600">{testEmailResult.message}</p>
                  )}
                </div>
                <Button variant="outline" onClick={handleDisconnect} disabled={saving}>
                  {saving ? 'Odłączanie...' : 'Odłącz konto'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  Niepołączono
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Połącz konto Gmail, aby używać go do wysyłki wiadomości.
                </p>
              </div>
              <Button onClick={handleConnect}>Połącz konto Gmail</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>Dostawca e-mail</CardTitle>
            <CardDescription>Wybierz przez kogo wysyłać e-maile.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={currentProvider}
              onValueChange={handleProviderChange}
              className="space-y-3"
            >
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <RadioGroupItem
                  value="resend"
                  id="email-provider-resend"
                  disabled={saving}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <Label htmlFor="email-provider-resend" className="cursor-pointer">
                    Resend (domyślny)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Platforma Resend — brak limitów dziennych
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <RadioGroupItem
                  value="gmail"
                  id="email-provider-gmail"
                  disabled={saving}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <Label htmlFor="email-provider-gmail" className="cursor-pointer">
                    Gmail
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Twoje konto Gmail — limit 500 e-maili/dzień
                  </p>
                </div>
              </div>
            </RadioGroup>

            {saving && (
              <p className="mt-3 text-sm text-muted-foreground">Zapisywanie ustawień...</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Uwaga: Gmail ma dzienny limit 500 wysłanych e-maili. Resend nie ma limitu dziennego.
      </div>
    </div>
  )
}
