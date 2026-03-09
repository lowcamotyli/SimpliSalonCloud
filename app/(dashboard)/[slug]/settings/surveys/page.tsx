'use client'

import * as React from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface ServiceSurveyConfig {
  id: string
  name: string
  category: string
  subcategory: string
  survey_enabled: boolean
  survey_custom_message: string | null
}

export default function SurveysSettingsPage(): JSX.Element {
  const [services, setServices] = React.useState<ServiceSurveyConfig[]>([])
  const [isLoading, setIsLoading] = React.useState<boolean>(true)
  const [isUpdating, setIsUpdating] = React.useState<string | null>(null)

  const fetchServices = React.useCallback(async () => {
    try {
      const response = await fetch('/api/settings/surveys')
      if (!response.ok) throw new Error('Nie udało się pobrać usług')
      const data = await response.json()
      setServices(data.services)
    } catch (error) {
      toast.error('Błąd podczas pobierania danych')
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchServices()
  }, [fetchServices])

  const updateService = async (id: string, payload: Partial<ServiceSurveyConfig>) => {
    setIsUpdating(id)
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Błąd zapisu')
      
      setServices(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s))
      toast.success('Zapisano zmiany')
    } catch (error) {
      toast.error('Nie udało się zapisać zmian')
      // Revert local state if needed (refetch)
      fetchServices()
    } finally {
      setIsUpdating(null)
    }
  }

  const handleToggle = (id: string, enabled: boolean) => {
    updateService(id, { survey_enabled: enabled })
  }

  const handleBlur = (id: string, value: string) => {
    const service = services.find(s => s.id === id)
    if (service && service.survey_custom_message !== value) {
      updateService(id, { survey_custom_message: value || null })
    }
  }

  const handleLocalMessageChange = (id: string, value: string) => {
    if (value.length > 320) return
    setServices(prev => prev.map(s => s.id === id ? { ...s, survey_custom_message: value } : s))
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-1/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const groupedServices = services.reduce((acc, service) => {
    if (!acc[service.category]) acc[service.category] = []
    acc[service.category].push(service)
    return acc
  }, {} as Record<string, ServiceSurveyConfig[]>)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ankiety po wizycie</h1>
        <p className="text-muted-foreground">Skonfiguruj automatyczne zaproszenia do wystawienia opinii dla swoich usług.</p>
      </div>

      {Object.entries(groupedServices).map(([category, categoryServices]) => (
        <Card key={category} className="overflow-hidden">
          <CardHeader className="bg-muted/50 py-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{category}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {categoryServices.map((service) => (
              <div key={service.id} className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">{service.subcategory}</span>
                      <span className="text-sm font-medium text-muted-foreground">•</span>
                      <span className="font-semibold">{service.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`survey-${service.id}`} className="sr-only">Włącz ankietę</Label>
                    <Switch
                      id={`survey-${service.id}`}
                      checked={service.survey_enabled}
                      onCheckedChange={(checked) => handleToggle(service.id, checked)}
                      disabled={isUpdating === service.id}
                    />
                  </div>
                </div>

                {service.survey_enabled && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="relative">
                      <Input
                        placeholder="Dziękujemy za wizytę! Oceń nas: {{url}} (pozostaw puste dla domyślnej wiadomości)"
                        value={service.survey_custom_message || ''}
                        onChange={(e) => handleLocalMessageChange(service.id, e.target.value)}
                        onBlur={(e) => handleBlur(service.id, e.target.value)}
                        className="pr-16"
                        maxLength={320}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
                        {(service.survey_custom_message || '').length}/320
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Użyj <Badge variant="secondary" className="text-[10px] px-1 py-0 h-auto font-mono">{"{{url}}"}</Badge> aby wstawić link do opinii.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
