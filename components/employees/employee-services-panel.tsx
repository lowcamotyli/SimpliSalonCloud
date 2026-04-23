'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/formatters'

type Service = {
  id: string
  name: string
  category: string
  subcategory?: string
  duration: number
  price: number
  active: boolean
}

type GroupedServiceResponse = {
  category: string
  subcategories: Array<{
    name: string
    services: Array<{
      id: string
      name: string
      duration: number
      price: number
    }>
  }>
}

type EmployeeServicesPanelProps = {
  employeeId: string
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

function normalizeServices(
  services: Service[] | GroupedServiceResponse[] | undefined
): Service[] {
  if (!Array.isArray(services) || services.length === 0) {
    return []
  }

  const firstItem = services[0]

  if ('subcategories' in firstItem) {
    const normalized: Service[] = []

    for (const categoryGroup of services as GroupedServiceResponse[]) {
      for (const subcategory of categoryGroup.subcategories) {
        for (const service of subcategory.services) {
          normalized.push({
            id: service.id,
            name: service.name,
            category: categoryGroup.category,
            subcategory: subcategory.name,
            duration: service.duration,
            price: service.price,
            active: true,
          })
        }
      }
    }

    return normalized
  }

  return (services as Service[]).filter((service) => service.active !== false)
}

export function EmployeeServicesPanel({
  employeeId,
  isOpen,
  onClose,
  onSaved,
}: EmployeeServicesPanelProps): JSX.Element {
  const [services, setServices] = useState<Service[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      return
    }

    const controller = new AbortController()
    let isCancelled = false

    const loadData = async (): Promise<void> => {
      setIsLoading(true)

      try {
        const [servicesResponse, assignedResponse] = await Promise.all([
          fetch('/api/services', {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(`/api/employees/${employeeId}/services`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }),
        ])

        if (!servicesResponse.ok) {
          throw new Error('Nie udalo sie pobrac uslug salonu.')
        }

        if (!assignedResponse.ok) {
          throw new Error('Nie udalo sie pobrac przypisanych uslug.')
        }

        const servicesData = (await servicesResponse.json()) as {
          services?: Service[] | GroupedServiceResponse[]
        }
        const assignedData = (await assignedResponse.json()) as {
          services?: Service[]
        }

        if (isCancelled) {
          return
        }

        const normalizedServices = normalizeServices(servicesData.services)
        const activeServices = normalizedServices.filter((service) => service.active !== false)

        setServices(activeServices)
        setCheckedIds(
          new Set((assignedData.services ?? []).map((service) => service.id))
        )
      } catch (error) {
        if (controller.signal.aborted || isCancelled) {
          return
        }

        setServices([])
        setCheckedIds(new Set())
        toast.error(
          error instanceof Error ? error.message : 'Nie udalo sie pobrac uslug pracownika.'
        )
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [employeeId, isOpen])

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return services
    }

    return services.filter((service) => {
      const haystack = [service.name, service.category, service.subcategory ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [search, services])

  const groupedServices = useMemo(() => {
    return filteredServices.reduce<Record<string, Service[]>>((groups, service) => {
      if (!groups[service.category]) {
        groups[service.category] = []
      }

      groups[service.category].push(service)
      return groups
    }, {})
  }, [filteredServices])

  const groupedEntries = useMemo(() => Object.entries(groupedServices), [groupedServices])

  const toggleService = (serviceId: string, checked: boolean): void => {
    setCheckedIds((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(serviceId)
      } else {
        next.delete(serviceId)
      }

      return next
    })
  }

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)

    try {
      const response = await fetch(`/api/employees/${employeeId}/services/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_ids: Array.from(checkedIds),
          action: 'set',
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udalo sie zapisac uslug pracownika.')
      }

      toast.success('Uslugi pracownika zostaly zapisane.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Nie udalo sie zapisac uslug pracownika.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) {
          onClose()
        }
      }}
    >
      <SheetContent side="right" className="flex h-full w-full max-w-2xl flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Uslugi pracownika</SheetTitle>
          <SheetDescription>
            Wybierz uslugi, ktore ten pracownik moze wykonywac.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj po nazwie lub kategorii"
              disabled={isLoading || isSaving}
            />
            <Badge variant="secondary">{filteredServices.length}</Badge>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : groupedEntries.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Brak uslug pasujacych do wyszukiwania.
            </div>
          ) : (
            <ScrollArea className="flex-1 rounded-md border">
              <div className="space-y-6 p-4">
                {groupedEntries.map(([category, categoryServices]) => (
                  <section key={category} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">{category}</h3>
                      <Badge variant="outline">{categoryServices.length}</Badge>
                    </div>

                    <div className="space-y-2">
                      {categoryServices.map((service) => {
                        const checkboxId = `employee-service-${service.id}`

                        return (
                          <label
                            key={service.id}
                            htmlFor={checkboxId}
                            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={checkedIds.has(service.id)}
                              onCheckedChange={(checked) =>
                                toggleService(service.id, checked === true)
                              }
                              disabled={isSaving}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{service.name}</span>
                                {service.subcategory ? (
                                  <Badge variant="secondary">{service.subcategory}</Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {service.duration} min • {formatPrice(service.price)}
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <SheetFooter className="mt-6 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSave()
            }}
            disabled={isLoading || isSaving}
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
