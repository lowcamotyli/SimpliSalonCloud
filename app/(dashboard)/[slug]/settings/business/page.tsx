'use client'

import { useEffect } from 'react'
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
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Database } from '@/types/supabase'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const businessSettingsSchema = z.object({
  business_type: z.string().min(1, 'Wybierz typ działalności'),
  description: z.string().optional(),
  contact_phone: z.string().min(9, 'Minimum 9 cyfr').optional().or(z.literal('')),
  contact_email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  accounting_email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  website_url: z.string().url('Nieprawidłowy URL').optional().or(z.literal('')),
  address: z.object({
    street: z.string().min(3, 'Minimum 3 znaki').optional().or(z.literal('')),
    city: z.string().min(2, 'Minimum 2 znaki').optional().or(z.literal('')),
    postalCode: z.string().regex(/^\d{2}-\d{3}$/, 'Format: 00-000').optional().or(z.literal('')),
    country: z.string().default('Polska')
  }),
  operating_hours: z.any()
})

type BusinessSettingsFormData = z.infer<typeof businessSettingsSchema>
type SalonRow = Database['public']['Tables']['salons']['Row']

export default function BusinessSettingsPage() {
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
  const { data: settings } = useSettings(salonId)
  const updateSettings = useUpdateSettings(salonId)

  const form = useForm<BusinessSettingsFormData>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: {
      business_type: 'beauty_salon',
      description: '',
      contact_phone: '',
      contact_email: '',
      accounting_email: '',
      website_url: '',
      address: {
        street: '',
        city: '',
        postalCode: '',
        country: 'Polska'
      },
      operating_hours: {}
    },
    mode: 'onChange'
  })

  useEffect(() => {
    if (settings) {
      form.reset({
        business_type: settings.business_type || 'beauty_salon',
        description: settings.description || '',
        contact_phone: settings.contact_phone || '',
        contact_email: settings.contact_email || '',
        accounting_email: settings.accounting_email || '',
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
  }, [settings, form])

  if (!salon || !settings) return <div className="p-6">Ładowanie...</div>

  const onSubmit = (data: BusinessSettingsFormData) => {
    updateSettings.mutate({
      ...data,
      address: {
        street: data.address.street ?? '',
        city: data.address.city ?? '',
        postalCode: data.address.postalCode ?? '',
        country: data.address.country ?? 'Polska',
      },
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Informacje o biznesie</h1>
            <p className="text-muted-foreground">Dane kontaktowe i godziny otwarcia Twojego salonu</p>
          </div>
          <Button type="submit" disabled={updateSettings.isPending || !form.formState.isValid}>
            {updateSettings.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapisywanie...
              </>
            ) : 'Zapisz zmiany'}
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
                <div className="space-y-2">
                  <Label>Typ działalności</Label>
                  <Select
                    value={form.watch('business_type')}
                    onValueChange={(v) => form.setValue('business_type', v, { shouldValidate: true })}
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
                  {form.formState.errors.business_type && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.business_type.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Opis</Label>
                  <Textarea
                    {...form.register('description')}
                    placeholder="Krótki opis Twojego biznesu..."
                    className="h-24"
                  />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Kontakt" description="Jak klienci mogą Cię znaleźć">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email kontaktowy</Label>
                  <Input
                    {...form.register('contact_email')}
                    placeholder="kontakt@twojsalon.pl"
                  />
                  {form.formState.errors.contact_email && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.contact_email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Email do rozliczeń / księgowości</Label>
                  <Input
                    {...form.register('accounting_email')}
                    placeholder="ksiegowosc@twojsalon.pl"
                  />
                  {form.formState.errors.accounting_email && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.accounting_email.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Na ten adres system wyśle podsumowanie po wygenerowaniu wynagrodzeń</p>
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    {...form.register('contact_phone')}
                    placeholder="+48 123 456 789"
                  />
                  {form.formState.errors.contact_phone && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.contact_phone.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Strona WWW</Label>
                  <Input
                    {...form.register('website_url')}
                    placeholder="https://www.twojsalon.pl"
                  />
                  {form.formState.errors.website_url && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.website_url.message}
                    </p>
                  )}
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Adres" description="Lokalizacja salonu">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ulica i numer</Label>
                  <Input
                    {...form.register('address.street')}
                    placeholder="ul. Piękna 12"
                  />
                  {form.formState.errors.address?.street && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.address.street.message}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kod pocztowy</Label>
                    <Input
                      {...form.register('address.postalCode')}
                      placeholder="00-001"
                    />
                    {form.formState.errors.address?.postalCode && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.address.postalCode.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Miasto</Label>
                    <Input
                      {...form.register('address.city')}
                      placeholder="Warszawa"
                    />
                    {form.formState.errors.address?.city && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.address.city.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Godziny otwarcia" description="Kiedy Twój salon jest dostępny">
              <HoursEditor
                hours={form.watch('operating_hours')}
                onChange={(hours) => form.setValue('operating_hours', hours, { shouldDirty: true })}
              />
            </SettingsCard>
          </div>
        </div>
      </form>
    </div>
  )
}
