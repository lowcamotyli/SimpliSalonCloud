// app/(dashboard)/[slug]/settings/business/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useSalon } from '@/hooks/use-salon'
import { useSettings, useUpdateSettings } from '@/hooks/use-settings'
import { SettingsNav } from '@/components/settings/settings-nav'
import { SettingsCard } from '@/components/settings/settings-card'
import { HoursEditor } from '@/components/settings/hours-editor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function BusinessPage({ params }: { params: { slug: string } }) {
  const { salon } = useSalon(params.slug)
  const { data: settings } = useSettings(salon?.id || '')
  const updateSettings = useUpdateSettings(salon?.id || '')
  
  const [formData, setFormData] = useState({
    description: '',
    contact_phone: '',
    contact_email: '',
    website_url: '',
    operating_hours: {}
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        description: settings.description || '',
        contact_phone: settings.contact_phone || '',
        contact_email: settings.contact_email || '',
        website_url: settings.website_url || '',
        operating_hours: settings.operating_hours || {}
      })
    }
  }, [settings])

  if (!salon || !settings) return <div>Ładowanie...</div>

  const handleSave = () => {
    updateSettings.mutate(formData)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Biznes</h1>
          <p className="text-muted-foreground">Informacje o Twoim salonie</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Zapisywanie...' : 'Zapisz zmiany'}
        </Button>
      </div>

      <SettingsNav baseUrl={`/${params.slug}/settings`} />

      <div className="space-y-6">
        <SettingsCard title="Podstawowe informacje">
          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Krótki opis Twojego salonu..."
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="+48 123 456 789"
                />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="kontakt@salon.pl"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="website">Strona WWW</Label>
              <Input
                id="website"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://mojsalon.pl"
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard 
          title="Godziny otwarcia" 
          description="Ustaw godziny pracy dla każdego dnia tygodnia"
        >
          <HoursEditor
            hours={formData.operating_hours}
            onChange={(hours) => setFormData({ ...formData, operating_hours: hours })}
          />
        </SettingsCard>
      </div>
    </div>
  )
}