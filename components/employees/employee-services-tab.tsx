'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { useCurrentRole } from '@/hooks/use-current-role'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

type EmployeeService = {
  id: string
  name: string
  duration: number
  price: number
  category: string
  subcategory: string
}

type SalonServiceGroup = {
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

type EmployeeServicesTabProps = {
  employeeId: string
  salonSlug: string
}

export function EmployeeServicesTab({
  employeeId,
  salonSlug,
}: EmployeeServicesTabProps) {
  const { isOwnerOrManager, isLoading: isRoleLoading } = useCurrentRole()
  const canManage = isOwnerOrManager()
  const [assignedServices, setAssignedServices] = useState<EmployeeService[]>([])
  const [allServices, setAllServices] = useState<SalonServiceGroup[]>([])
  const [isLoadingAssigned, setIsLoadingAssigned] = useState(true)
  const [isLoadingAll, setIsLoadingAll] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)

  const fetchAssignedServices = useCallback(async () => {
    setIsLoadingAssigned(true)

    try {
      const response = await fetch(`/api/employees/${employeeId}/services`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udało się pobrać przypisanych usług.')
      }

      const data = (await response.json()) as { services?: EmployeeService[] }
      setAssignedServices(data.services ?? [])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nie udało się pobrać przypisanych usług.'
      toast.error(message)
    } finally {
      setIsLoadingAssigned(false)
    }
  }, [employeeId])

  const fetchAllServices = useCallback(async () => {
    setIsLoadingAll(true)

    try {
      const response = await fetch('/api/services', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udało się pobrać usług salonu.')
      }

      const data = (await response.json()) as { services?: SalonServiceGroup[] }
      setAllServices(data.services ?? [])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nie udało się pobrać usług salonu.'
      toast.error(message)
    } finally {
      setIsLoadingAll(false)
    }
  }, [])

  useEffect(() => {
    if (isRoleLoading || !canManage) {
      return
    }

    void fetchAssignedServices()
    void fetchAllServices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAllServices, fetchAssignedServices, isRoleLoading])

  const unassignedServices = useMemo(() => {
    const assignedIds = new Set(assignedServices.map((service) => service.id))
    const normalizedQuery = query.trim().toLowerCase()

    return allServices
      .map((category) => ({
        category: category.category,
        subcategories: category.subcategories
          .map((subcategory) => ({
            name: subcategory.name,
            services: subcategory.services.filter((service) => {
              if (assignedIds.has(service.id)) {
                return false
              }

              if (!normalizedQuery) {
                return true
              }

              const haystack = [
                service.name,
                category.category,
                subcategory.name,
                `${service.duration}`,
                `${service.price}`,
              ]
                .join(' ')
                .toLowerCase()

              return haystack.includes(normalizedQuery)
            }),
          }))
          .filter((subcategory) => subcategory.services.length > 0),
      }))
      .filter((category) => category.subcategories.length > 0)
  }, [allServices, assignedServices, query])

  const unassignedCount = useMemo(
    () =>
      unassignedServices.reduce(
        (count, category) =>
          count +
          category.subcategories.reduce(
            (subcategoryCount, subcategory) => subcategoryCount + subcategory.services.length,
            0
          ),
        0
      ),
    [unassignedServices]
  )

  const handleAssignService = async (serviceId: string) => {
    setIsMutating(true)

    try {
      const response = await fetch(`/api/employees/${employeeId}/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serviceId }),
      })

      if (!response.ok) {
        throw new Error('Nie udało się przypisać usługi.')
      }

      toast.success('Usługa została przypisana.')
      setPopoverOpen(false)
      setQuery('')
      await fetchAssignedServices()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nie udało się przypisać usługi.'
      toast.error(message)
    } finally {
      setIsMutating(false)
    }
  }

  const handleRemoveService = async (serviceId: string) => {
    setRemovingId(serviceId)

    try {
      const response = await fetch(
        `/api/employees/${employeeId}/services?serviceId=${encodeURIComponent(serviceId)}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error('Nie udało się usunąć usługi.')
      }

      toast.success('Usługa została usunięta.')
      await fetchAssignedServices()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nie udało się usunąć usługi.'
      toast.error(message)
    } finally {
      setRemovingId(null)
    }
  }

  if (isRoleLoading) {
    return (
      <Card data-salon-slug={salonSlug}>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Ładowanie uprawnień...</p>
        </CardContent>
      </Card>
    )
  }

  if (!canManage) {
    return (
      <Card data-salon-slug={salonSlug}>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Nie masz uprawnień do zarządzania usługami pracownika.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card data-salon-slug={salonSlug}>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Usługi pracownika</CardTitle>
            <p className="text-sm text-muted-foreground">
              Wybierz, które usługi mogą być wykonywane przez tego pracownika.
            </p>
          </div>

          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingAll || isLoadingAssigned || isMutating || unassignedCount === 0}
                className="justify-between gap-2"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Dodaj usługę
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[360px] p-0">
              <Command>
                <CommandInput
                  placeholder="Szukaj usługi..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <CommandList>
                  {unassignedCount === 0 ? (
                    <CommandEmpty>Brak usług do przypisania.</CommandEmpty>
                  ) : (
                    unassignedServices.map((category) => (
                      <CommandGroup key={category.category} className="p-2">
                        <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {category.category}
                        </div>
                        {category.subcategories.map((subcategory) => (
                          <div key={`${category.category}-${subcategory.name}`} className="mb-1 last:mb-0">
                            <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                              {subcategory.name}
                            </div>
                            {subcategory.services.map((service) => (
                              <CommandItem
                                key={service.id}
                                onClick={() => void handleAssignService(service.id)}
                                disabled={isMutating}
                                className="justify-between gap-3"
                              >
                                <div className="min-w-0 text-left">
                                  <div className="truncate font-medium">{service.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {service.duration} min • {formatPrice(service.price)}
                                  </div>
                                </div>
                                <Check className="h-4 w-4 opacity-0" />
                              </CommandItem>
                            ))}
                          </div>
                        ))}
                      </CommandGroup>
                    ))
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            Przypisane: {assignedServices.length}
          </Badge>
          <Badge variant="outline">
            Dostępne do dodania: {unassignedCount}
          </Badge>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="space-y-3 p-6">
        {isLoadingAssigned || isLoadingAll ? (
          <p className="text-sm text-muted-foreground">Ładowanie usług...</p>
        ) : assignedServices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ten pracownik nie ma jeszcze przypisanych usług.
          </p>
        ) : (
          assignedServices.map((service) => (
            <div
              key={service.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{service.name}</span>
                  <Badge variant="outline">{service.category}</Badge>
                  <Badge variant="secondary">{service.subcategory}</Badge>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{service.duration} min</span>
                  <span>{formatPrice(service.price)}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleRemoveService(service.id)}
                disabled={isMutating || removingId === service.id}
                className={cn(
                  'shrink-0 text-muted-foreground hover:text-destructive',
                  removingId === service.id && 'animate-pulse'
                )}
                aria-label={`Usuń usługę ${service.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
