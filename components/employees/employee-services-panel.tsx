'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'

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

    const seen = new Set<string>()
    return normalized.filter((service) => {
      if (seen.has(service.id)) {
        return false
      }

      seen.add(service.id)
      return true
    })
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
    return filteredServices.reduce<Record<string, Record<string, Service[]>>>(
      (groups, service) => {
        if (!groups[service.category]) {
          groups[service.category] = {}
        }

        const subcategory = service.subcategory ?? ''
        if (!groups[service.category][subcategory]) {
          groups[service.category][subcategory] = []
        }

        groups[service.category][subcategory].push(service)
        return groups
      },
      {}
    )
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
    <div
      className={cn(
        'flex flex-col overflow-hidden transition-all duration-300 border rounded-lg bg-background shrink-0',
        isOpen ? 'w-[480px] opacity-100' : 'w-0 opacity-0 border-0'
      )}
    >
          <div className="flex shrink-0 items-start justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Usługi pracownika</h2>
              <p className="text-sm text-muted-foreground">
                {filteredServices.length} usług dostępnych
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} disabled={isSaving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj po nazwie lub kategorii"
              disabled={isLoading || isSaving}
            />
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : groupedEntries.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Brak usług pasujących do wyszukiwania.
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-2">
                  <Accordion type="multiple" defaultValue={[]} className="space-y-1">
                    {groupedEntries.map(([category, subcatMap]) => {
                      const totalCount = Object.values(subcatMap).reduce((s, arr) => s + arr.length, 0)
                      return (
                        <AccordionItem key={category} value={category} className="rounded-md border px-0 shadow-none">
                          <AccordionTrigger className="px-3 py-2 text-sm font-semibold hover:no-underline">
                            <span className="flex items-center gap-2">
                              {category}
                              <Badge variant="outline" className="text-xs">{totalCount}</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-2">
                            {Object.entries(subcatMap).map(([subcat, subcatServices]) => (
                              <div key={subcat} className="space-y-1">
                                {subcat ? (
                                  <p className="pb-1 pt-2 text-xs font-medium text-muted-foreground">{subcat}</p>
                                ) : null}
                                {subcatServices.map((service) => {
                                  const checkboxId = "employee-service-" + service.id
                                  return (
                                    <label
                                      key={service.id}
                                      htmlFor={checkboxId}
                                      className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        id={checkboxId}
                                        checked={checkedIds.has(service.id)}
                                        onCheckedChange={(checked) => toggleService(service.id, checked === true)}
                                        disabled={isSaving}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <span className="block truncate text-sm">{service.name}</span>
                                        <span className="text-xs text-muted-foreground">{service.duration} min • {formatPrice(service.price)}</span>
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </div>
              </ScrollArea>
            )}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Anuluj
            </Button>
            <Button
              type="button"
              onClick={() => { void handleSave() }}
              disabled={isLoading || isSaving}
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zapisz
            </Button>
          </div>
    </div>
  )
}
