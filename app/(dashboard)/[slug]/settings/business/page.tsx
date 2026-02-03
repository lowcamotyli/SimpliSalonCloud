'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { HoursEditor } from '@/components/settings/hours-editor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function BusinessSettingsPage() {
  const params = useParams()
  const slug = params.slug as string

  // LOG TO CONSOLE TO VERIFY RENDER
  console.log('Rendering BusinessSettingsPage for slug:', slug)

  const { data: salon } = useQuery({
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

  const { data: settings } = useSettings(salon?.id || '')
  const updateSettings = useUpdateSettings(salon?.id || '')

  const [formData, setFormData] = useState({
    business_type: '',
    description: '',
    contact_phone: '',
    contact_email: '',
    website_url: '',
    address: {
      street: '',
      city: '',
      postalCode: '',
      country: 'Polska'
    },
    operating_hours: {} as any
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        business_type: settings.business_type || 'beauty_salon',
        description: settings.description || '',
        contact_phone: settings.contact_phone || '',
        contact_email: settings.contact_email || '',
        website_url: settings.website_url || '',
        address: {
          street: settings.address?.street || '',
          city: settings.address?.city || '',
          postalCode: settings.address?.postalCode || '',
          country: settings.address?.country || 'Polska'
        },
        operating_hours: settings.operating_hours || {}
      })
    }
  }, [settings])

  if (!salon || !settings) return <div className="p-6">Ładowanie...</div>

  const handleSave = () => {
    updateSettings.mutate(formData)
  }

  const updateAddress = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value
      }
    }))
  }

  return (
    <div className="p-6 max-w-6xl mx-auto border-2 border-green-500">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Informacje o biznesie (VER 2)</h1>
          <p className="text-muted-foreground">Dane kontaktowe i godziny otwarcia Twojego salonu</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <SettingsNav baseUrl={`/${slug}/settings`} />

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SettingsCard title="Podstawowe informacje" description="Nazwa i rodzaj działalności">
            <div className="space-y-4">
              <div>
                <Label>Nazwa salonu</Label>
                <Input value={salon.name} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">Nazwa jest pobierana z profilu salonu</p>
              </div>
              <div>
                <Label>Typ działalności</Label>
                <Select
                  value={formData.business_type}
                  onValueChange={(v) => setFormData(p => ({ ...p, business_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz typ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beauty_salon">Salon kosmetyczny / Fryzjer</SelectItem>
                    <SelectItem value="medical">Gabinet lekarski</SelectItem>
                    <SelectItem value="fitness">Fitness / Sport</SelectItem>
                    <SelectItem value="auto">Serwis samochodowy</SelectItem>
                    <SelectItem value="other">Inne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Opis</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  placeholder="Krótki opis Twojego biznesu..."
                  className="h-24"
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Kontakt" description="Jak klienci mogą Cię znaleźć">
            <div className="space-y-4">
              <div>
                <Label>Email kontaktowy</Label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(p => ({ ...p, contact_email: e.target.value }))}
                  placeholder="kontakt@twojsalon.pl"
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={(e) => setFormData(p => ({ ...p, contact_phone: e.target.value }))}
                  placeholder="+48 123 456 789"
                />
              </div>
              <div>
                <Label>Strona WWW</Label>
                <Input
                  value={formData.website_url}
                  onChange={(e) => setFormData(p => ({ ...p, website_url: e.target.value }))}
                  placeholder="https://www.twojsalon.pl"
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Adres" description="Lokalizacja salonu">
            <div className="space-y-4">
              <div>
                <Label>Ulica i numer</Label>
                <Input
                  value={formData.address.street}
                  onChange={(e) => updateAddress('street', e.target.value)}
                  placeholder="ul. Piękna 12"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kod pocztowy</Label>
                  <Input
                    value={formData.address.postalCode}
                    onChange={(e) => updateAddress('postalCode', e.target.value)}
                    placeholder="00-001"
                  />
                </div>
                <div>
                  <Label>Miasto</Label>
                  <Input
                    value={formData.address.city}
                    onChange={(e) => updateAddress('city', e.target.value)}
                    placeholder="Warszawa"
                  />
                </div>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Godziny otwarcia" description="Kiedy Twój salon jest dostępny">
            <HoursEditor
              hours={formData.operating_hours}
              onChange={(hours) => setFormData(p => ({ ...p, operating_hours: hours }))}
            />
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}