'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { EmployeeServicesPanel } from '@/components/employees/employee-services-panel'
import { ObjectLink } from '@/components/objects'
import { useCurrentRole } from '@/hooks/use-current-role'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  onPanelChange?: (open: boolean) => void
}

export function EmployeeServicesTab({
  employeeId,
  salonSlug,
  onPanelChange,
}: EmployeeServicesTabProps) {
  const { isOwnerOrManager, isLoading: isRoleLoading } = useCurrentRole()
  const canManage = isOwnerOrManager()
  const [assignedServices, setAssignedServices] = useState<EmployeeService[]>([])
  const [allServices, setAllServices] = useState<SalonServiceGroup[]>([])
  const [isLoadingAssigned, setIsLoadingAssigned] = useState(true)
  const [isLoadingAll, setIsLoadingAll] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)

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

  const unassignedCount = useMemo(() => {
    const assignedIds = new Set(assignedServices.map((service) => service.id))
    let count = 0

    for (const category of allServices) {
      for (const subcategory of category.subcategories) {
        for (const service of subcategory.services) {
          if (!assignedIds.has(service.id)) {
            count += 1
          }
        }
      }
    }

    return count
  }, [allServices, assignedServices])

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
    <div className='flex items-start gap-4'>
      <Card className='flex-1 min-w-0' data-salon-slug={salonSlug}>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Usługi pracownika</CardTitle>
              <p className="text-sm text-muted-foreground">
                Wybierz, które usługi mogą być wykonywane przez tego pracownika.
              </p>
            </div>

            {canManage ? (
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingAll || isLoadingAssigned}
                onClick={() => {
                  setIsPanelOpen(true)
                  onPanelChange?.(true)
                }}
              >
                Zarządzaj usługami
              </Button>
            ) : null}
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

        <CardContent className="p-3">
          {isLoadingAssigned || isLoadingAll ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">Ładowanie usług...</p>
          ) : assignedServices.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              Brak przypisanych usług.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {assignedServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                >
                  <ObjectLink type="service" id={service.id} label={service.name} slug={salonSlug} className="flex-1 truncate text-sm" />
                  {service.subcategory ? (
                    <Badge variant="secondary" className="hidden shrink-0 text-xs sm:inline-flex">
                      {service.subcategory}
                    </Badge>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {service.duration} min
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleRemoveService(service.id)}
                    disabled={isMutating || removingId === service.id}
                    className={cn(
                      'h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive',
                      removingId === service.id && 'animate-pulse'
                    )}
                    aria-label={`Usuń usługę ${service.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeServicesPanel
        employeeId={employeeId}
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false)
          onPanelChange?.(false)
        }}
        onSaved={() => {
          setIsPanelOpen(false)
          onPanelChange?.(false)
          void fetchAssignedServices()
        }}
      />
    </div>
  )
}
