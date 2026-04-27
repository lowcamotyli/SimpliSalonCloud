'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

interface AssignEmployeesModalProps {
  serviceId: string
  serviceName: string
  isOpen: boolean
  onClose: () => void
}

interface Employee {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  employee_code?: string | null
}

interface EmployeesResponse {
  employees?: Employee[]
}

const getEmployeeDisplayName = (employee: Employee): string => {
  const fullName = [employee.first_name, employee.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')

  return (
    employee.name?.trim() ||
    fullName ||
    employee.email?.trim() ||
    employee.employee_code?.trim() ||
    'Pracownik bez nazwy'
  )
}

export function AssignEmployeesModal({
  serviceId,
  serviceName,
  isOpen,
  onClose,
}: AssignEmployeesModalProps): JSX.Element {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setEmployees([])
      setSelectedEmployeeIds([])
      setIsLoading(false)
      return
    }

    let cancelled = false

    const loadEmployees = async (): Promise<void> => {
      setIsLoading(true)
      setSelectedEmployeeIds([])

      try {
        const response = await fetch('/api/employees')

        if (!response.ok) {
          throw new Error('Nie udało się pobrać pracowników')
        }

        const data = (await response.json()) as EmployeesResponse

        if (!cancelled) {
          setEmployees(Array.isArray(data.employees) ? data.employees : [])
        }
      } catch (error) {
        if (!cancelled) {
          setEmployees([])
          toast.error(error instanceof Error ? error.message : 'Nie udało się pobrać pracowników')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadEmployees().catch(() => {
      return
    })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  const toggleEmployee = (employeeId: string, checked: boolean): void => {
    setSelectedEmployeeIds((current) => {
      if (checked) {
        return current.includes(employeeId) ? current : [...current, employeeId]
      }

      return current.filter((id) => id !== employeeId)
    })
  }

  const handleAssign = async (): Promise<void> => {
    if (selectedEmployeeIds.length === 0) {
      toast.info('Nie wybrano pracowników do przypisania')
      onClose()
      return
    }

    setIsSubmitting(true)

    try {
      await Promise.all(
        selectedEmployeeIds.map(async (employeeId) => {
          const response = await fetch(`/api/employees/${employeeId}/services`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ serviceId }),
          })

          if (!response.ok) {
            const error = await response.json().catch(() => null)
            throw new Error(error?.error || 'Nie udało się przypisać pracowników')
          }
        })
      )

      toast.success('Pracownicy zostali przypisani')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nie udało się przypisać pracowników')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = (): void => {
    if (isSubmitting) {
      return
    }

    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Przypisz pracowników do usługi</DialogTitle>
          <DialogDescription>
            Wybierz pracowników, którzy mają wykonywać usługę {serviceName}.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={`employee-skeleton-${index}`} className="flex items-center gap-3">
                <div className="h-4 w-4 animate-pulse rounded-sm bg-muted" />
                <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Brak pracowników w salonie
          </div>
        ) : (
          <ScrollArea className="max-h-72 rounded-md border">
            <div className="space-y-3 p-4">
              {employees.map((employee) => {
                const checkboxId = `assign-employee-${employee.id}`
                const displayName = getEmployeeDisplayName(employee)

                return (
                  <div key={employee.id} className="flex items-center gap-3">
                    <Checkbox
                      id={checkboxId}
                      checked={selectedEmployeeIds.includes(employee.id)}
                      onCheckedChange={(checked) => toggleEmployee(employee.id, checked === true)}
                      disabled={isSubmitting}
                    />
                    <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium">
                      {displayName}
                    </Label>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleSkip} disabled={isSubmitting}>
            Pomiń
          </Button>
          <Button type="button" onClick={handleAssign} disabled={isSubmitting || isLoading}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Przypisz
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
