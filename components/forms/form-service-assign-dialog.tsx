'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface FormServiceAssignDialogProps {
  templateId: string
  templateName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Service {
  id: string
  name: string
  category: string | null
  subcategory: string | null
}

interface ServicesResponse {
  services: Service[]
}

interface TemplateServicesResponse {
  serviceIds: string[]
}

export function FormServiceAssignDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
}: FormServiceAssignDialogProps) {
  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !templateId) {
      return
    }

    let isCancelled = false

    const loadData = async () => {
      setLoading(true)

      try {
        const [servicesRes, assignedRes] = await Promise.all([
          fetch('/api/settings/surveys'),
          fetch(`/api/forms/templates/${templateId}/services`),
        ])

        if (!servicesRes.ok) {
          throw new Error('Nie udalo sie pobrac listy uslug')
        }

        if (!assignedRes.ok) {
          throw new Error('Nie udalo sie pobrac przypisan uslug')
        }

        const servicesData = (await servicesRes.json()) as ServicesResponse
        const assignedData = (await assignedRes.json()) as TemplateServicesResponse

        if (isCancelled) {
          return
        }

        setServices(Array.isArray(servicesData.services) ? servicesData.services : [])
        setSelectedServiceIds(new Set(assignedData.serviceIds ?? []))
      } catch {
        if (!isCancelled) {
          toast.error('Nie udalo sie zaladowac danych')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [open, templateId])

  const groupedServices = useMemo(() => {
    const groups = new Map<string, Service[]>()

    for (const service of services) {
      const category = service.category?.trim() || 'Bez kategorii'
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)?.push(service)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'pl'))
      .map(([category, items]) => ({
        category,
        services: [...items].sort((a, b) => {
          const aLabel = `${a.subcategory ?? ''} ${a.name}`.trim()
          const bLabel = `${b.subcategory ?? ''} ${b.name}`.trim()
          return aLabel.localeCompare(bLabel, 'pl')
        }),
      }))
  }, [services])

  const toggleService = (serviceId: string, checked: boolean) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(serviceId)
      } else {
        next.delete(serviceId)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const response = await fetch(`/api/forms/templates/${templateId}/services`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceIds: Array.from(selectedServiceIds),
        }),
      })

      if (!response.ok) {
        throw new Error('Nie udalo sie zapisac przypisan')
      }

      toast.success('Zapisano przypisania')
      onOpenChange(false)
    } catch {
      toast.error('Nie udalo sie zapisac przypisan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Przypisz formularz do uslug</DialogTitle>
          <DialogDescription>{templateName}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : groupedServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak uslug do przypisania.</p>
          ) : (
            groupedServices.map((group) => (
              <section key={group.category} className="space-y-2">
                <h3 className="text-sm font-semibold">{group.category}</h3>
                <div className="space-y-2">
                  {group.services.map((service) => {
                    const checkboxId = `service-${service.id}`
                    const subcategory = service.subcategory?.trim() || 'Bez podkategorii'

                    return (
                      <div
                        key={service.id}
                        className="flex items-center gap-3 rounded-md border p-2"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selectedServiceIds.has(service.id)}
                          onCheckedChange={(checked) =>
                            toggleService(service.id, checked === true)
                          }
                        />
                        <Label htmlFor={checkboxId} className="cursor-pointer text-sm">
                          {subcategory} • {service.name}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading || saving}>
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
