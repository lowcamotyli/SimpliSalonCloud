'use client'

import * as React from "react"
import { Pencil, Loader2, MessageSquare, ChevronDown, Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

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
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState('')

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

  const handleBulkToggle = async (
    category: string,
    enabled: boolean,
    visibleServices: ServiceSurveyConfig[]
  ) => {
    void category
    for (const service of visibleServices) {
      await updateService(service.id, { survey_enabled: enabled })
    }
    if (!enabled && expandedId && visibleServices.some(service => service.id === expandedId)) {
      setExpandedId(null)
    }
  }

  const groupedServices = React.useMemo(() => {
    return services.reduce((acc, service) => {
      if (!acc[service.category]) acc[service.category] = []
      acc[service.category].push(service)
      return acc
    }, {} as Record<string, ServiceSurveyConfig[]>)
  }, [services])

  const searchTerm = search.trim().toLowerCase()

  const filteredGrouped = React.useMemo(() => {
    return Object.entries(groupedServices).reduce((acc, [category, categoryServices]) => {
      const visibleServices = searchTerm
        ? categoryServices.filter((service) =>
            [service.name, service.subcategory, service.category].some((value) =>
              value.toLowerCase().includes(searchTerm)
            )
          )
        : categoryServices

      if (visibleServices.length > 0) {
        acc[category] = visibleServices
      }

      return acc
    }, {} as Record<string, ServiceSurveyConfig[]>)
  }, [groupedServices, searchTerm])

  React.useEffect(() => {
    const categories = Object.keys(groupedServices)
    if (categories.length === 1) {
      setExpandedCategories(prev => {
        if (prev.has(categories[0])) return prev
        const next = new Set(prev)
        next.add(categories[0])
        return next
      })
    }
  }, [groupedServices])

  React.useEffect(() => {
    if (!searchTerm) return

    setExpandedCategories(prev => {
      const next = new Set(prev)
      Object.keys(filteredGrouped).forEach((category) => {
        next.add(category)
      })
      return next
    })
  }, [filteredGrouped, searchTerm])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
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

  const enabledCount = services.filter(service => service.survey_enabled).length
  const visibleCategories = Object.entries(filteredGrouped)
  const totalVisibleResults = visibleCategories.reduce((sum, [, categoryServices]) => sum + categoryServices.length, 0)

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ankiety po wizycie</h1>
          <p className="text-muted-foreground">Skonfiguruj automatyczne zaproszenia do wystawienia opinii dla swoich usług.</p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground">{enabledCount} usług z aktywną ankietą</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj usługi..."
          className="pl-9"
        />
      </div>

      {totalVisibleResults === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Nie znaleziono usług</div>
      ) : (
        visibleCategories.map(([category, categoryServices]) => {
          const activeCount = categoryServices.filter(service => service.survey_enabled).length
          const allEnabled = categoryServices.length > 0 && activeCount === categoryServices.length
          const isExpanded = expandedCategories.has(category)

          return (
            <Card key={category} className="overflow-hidden border-border/70 shadow-sm">
              <CardHeader
                className="cursor-pointer gap-4 border-b bg-muted/20 py-4 sm:flex-row sm:items-center sm:justify-between"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-start gap-3">
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 text-muted-foreground transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                  />
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-bold uppercase tracking-[0.16em]">{category}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {activeCount}/{categoryServices.length} aktywnych
                    </p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Label htmlFor={`bulk-toggle-${category}`} className="text-sm text-muted-foreground">
                    Włącz wszystkie
                  </Label>
                  <Switch
                    id={`bulk-toggle-${category}`}
                    checked={allEnabled}
                    onCheckedChange={(checked) => handleBulkToggle(category, checked, categoryServices)}
                    disabled={isUpdating !== null}
                  />
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0">
                  <div className="divide-y">
                    {categoryServices.map((service) => {
                      const message = service.survey_custom_message || ''
                      const preview =
                        message.length > 40 ? `${message.slice(0, 40)}...` : message

                      return (
                        <div
                          key={service.id}
                          className={cn(
                            "p-4 transition-opacity",
                            !service.survey_enabled && "opacity-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">{service.subcategory}</span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-sm font-semibold">{service.name}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {service.survey_enabled && preview && (
                                <p className="max-w-[220px] truncate text-xs italic text-muted-foreground">
                                  {preview}
                                </p>
                              )}

                              {isUpdating === service.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : service.survey_enabled ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(current => current === service.id ? null : service.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                                  aria-label={expandedId === service.id ? "Zwiń edytor wiadomości" : "Edytuj wiadomość"}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              ) : null}

                              <Label htmlFor={`survey-${service.id}`} className="sr-only">Włącz ankietę</Label>
                              <Switch
                                id={`survey-${service.id}`}
                                checked={service.survey_enabled}
                                onCheckedChange={(checked) => handleToggle(service.id, checked)}
                                disabled={isUpdating === service.id}
                                className="opacity-100"
                              />
                            </div>
                          </div>

                          {service.survey_enabled && expandedId === service.id && (
                            <div className="animate-in fade-in slide-in-from-top-1 mt-4 space-y-2 duration-200">
                              <Textarea
                                placeholder="Dziękujemy za wizytę! Oceń nas: {{url}} (pozostaw puste dla domyślnej wiadomości)"
                                value={message}
                                onChange={(e) => handleLocalMessageChange(service.id, e.target.value)}
                                onBlur={(e) => handleBlur(service.id, e.target.value)}
                                rows={3}
                                className="resize-none"
                                maxLength={320}
                              />
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{message.length}/320</span>
                                <span>·</span>
                                <span>Użyj</span>
                                <Badge variant="secondary" className="font-mono text-[10px] px-1 py-0 h-auto">{"{{url}}"}</Badge>
                                <span>aby wstawić link do opinii</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}
