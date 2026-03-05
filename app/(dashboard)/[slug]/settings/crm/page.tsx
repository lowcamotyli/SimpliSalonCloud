'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldAlert, Save, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

type CrmSettings = {
  salon_id: string
  no_show_threshold: number
  late_cancel_threshold: number
  window_months: number
}

type BlacklistedClient = {
  id: string
  full_name: string
  phone: string | null
  no_show_count: number
  blacklisted_at: string | null
  blacklist_reason: string | null
  blacklist_status: 'clean' | 'warned' | 'blacklisted'
}

export default function CrmSettingsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [isSaving, setIsSaving] = useState(false)

  const { data: salon } = useQuery<{ id: string; slug: string } | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salons')
        .select('id, slug')
        .eq('slug', slug)
        .single()

      if (error) throw error
      return data
    },
  })

  const salonId = salon?.id || ''

  const crmQuery = useQuery<{ settings: CrmSettings; blacklistedClients: BlacklistedClient[] }>({
    queryKey: ['settings-crm', salonId],
    enabled: !!salonId,
    queryFn: async () => {
      const res = await fetch(`/api/settings/crm?salonId=${salonId}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Nie udalo sie pobrac ustawien CRM')
      }
      return {
        settings: payload.settings,
        blacklistedClients: payload.blacklistedClients || [],
      }
    },
  })

  const [formState, setFormState] = useState({
    no_show_threshold: 2,
    late_cancel_threshold: 3,
    window_months: 6,
  })

  const settings = crmQuery.data?.settings

  useEffect(() => {
    if (!settings) return
    setFormState({
      no_show_threshold: settings.no_show_threshold,
      late_cancel_threshold: settings.late_cancel_threshold,
      window_months: settings.window_months,
    })
  }, [settings])

  const saveSettings = async () => {
    if (!salonId) return

    setIsSaving(true)
    try {
      const res = await fetch('/api/settings/crm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId,
          no_show_threshold: Number(formState.no_show_threshold),
          late_cancel_threshold: Number(formState.late_cancel_threshold),
          window_months: Number(formState.window_months),
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Nie udalo sie zapisac ustawien CRM')
      }

      toast.success('Ustawienia CRM zapisane')
      await crmQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Blad zapisu ustawien CRM')
    } finally {
      setIsSaving(false)
    }
  }

  if (!salon) {
    return <div className="p-6">Ladowanie...</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8 px-4 sm:px-0">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Ustawienia CRM</h1>
        <p className="text-muted-foreground">Scoring no-show, ostrzezenia i automatyczna czarna lista.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            Progi blacklist
          </CardTitle>
          <CardDescription>Dzienny CRON analizuje naruszenia z ostatnich miesiecy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="no_show_threshold">Prog no-show</Label>
              <Input
                id="no_show_threshold"
                type="number"
                min={1}
                max={10}
                value={formState.no_show_threshold}
                onChange={(e) => setFormState((prev) => ({ ...prev, no_show_threshold: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="late_cancel_threshold">Prog poznych anulacji</Label>
              <Input
                id="late_cancel_threshold"
                type="number"
                min={1}
                max={10}
                value={formState.late_cancel_threshold}
                onChange={(e) => setFormState((prev) => ({ ...prev, late_cancel_threshold: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="window_months">Okno czasowe (mies.)</Label>
              <Input
                id="window_months"
                type="number"
                min={1}
                max={24}
                value={formState.window_months}
                onChange={(e) => setFormState((prev) => ({ ...prev, window_months: Number(e.target.value) }))}
              />
            </div>
          </div>

          <Button onClick={saveSettings} disabled={isSaving || crmQuery.isFetching}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Zapisz ustawienia
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Klienci na czarnej liscie</CardTitle>
          <CardDescription>Lista klientow z aktywna blokada rezerwacji online.</CardDescription>
        </CardHeader>
        <CardContent>
          {crmQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Ladowanie listy
            </div>
          ) : (crmQuery.data?.blacklistedClients || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak klientow z aktywna blokada.</p>
          ) : (
            <div className="space-y-3">
              {(crmQuery.data?.blacklistedClients || []).map((client) => (
                <div key={client.id} className="rounded-lg border p-3">
                  <div className="font-medium">{client.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {client.phone || 'Brak telefonu'} | no-show: {client.no_show_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {client.blacklist_reason || 'Brak powodu'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
