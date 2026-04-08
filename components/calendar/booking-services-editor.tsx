'use client'

import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

type ServiceOption = {
  id: string
  name: string
  price: number
  duration: number
}

type EmployeeOption = {
  id: string
  first_name: string
  last_name: string
}

type AddonOption = {
  id: string
  name: string
  price: number
}

type BookingRow = {
  id: string
  service_id: string | null
  employee_id: string | null
  start_time: string
  addon_ids: string[]
}

type BookingServicesEditorProps = {
  bookingId: string
  groupId?: string
  initialServices: BookingRow[]
  availableServices: ServiceOption[]
  availableEmployees: EmployeeOption[]
  onSaved: () => void
}

type EditableRow = {
  localId: string
  id?: string
  service_id: string | null
  employee_id: string | null
  start_time: string
  addon_ids: string[]
}

const EMPTY_SELECT_VALUE = '__none__'

const formatEmployeeName = (employee: EmployeeOption): string => {
  return `${employee.first_name} ${employee.last_name}`.trim()
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const makeLocalId = (): string => {
  return `new-${Math.random().toString(36).slice(2, 10)}`
}

export default function BookingServicesEditor({
  bookingId,
  groupId,
  initialServices,
  availableServices,
  availableEmployees,
  onSaved,
}: BookingServicesEditorProps) {
  const [rows, setRows] = useState<EditableRow[]>(() => {
    if (initialServices.length > 0) {
      return initialServices.map((row) => ({
        localId: row.id,
        id: row.id,
        service_id: row.service_id,
        employee_id: row.employee_id,
        start_time: row.start_time,
        addon_ids: row.addon_ids,
      }))
    }

    return [
      {
        localId: makeLocalId(),
        service_id: null,
        employee_id: null,
        start_time: '',
        addon_ids: [],
      },
    ]
  })
  const [addonsByRow, setAddonsByRow] = useState<Record<string, AddonOption[]>>({})
  const [employeesByRow, setEmployeesByRow] = useState<Record<string, EmployeeOption[]>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [forceOverride, setForceOverride] = useState(false)

  useEffect(() => {
    const nextRows = initialServices.length
      ? initialServices.map((row) => ({
          localId: row.id,
          id: row.id,
          service_id: row.service_id,
          employee_id: row.employee_id,
          start_time: row.start_time,
          addon_ids: row.addon_ids,
        }))
      : [
          {
            localId: makeLocalId(),
            service_id: null,
            employee_id: null,
            start_time: '',
            addon_ids: [],
          },
        ]

    setRows(nextRows)
  }, [initialServices])

  useEffect(() => {
    const controllers: AbortController[] = []

    for (const row of rows) {
      if (!row.service_id) {
        setAddonsByRow((current) => {
          if (!current[row.localId]) {
            return current
          }

          const next = { ...current }
          delete next[row.localId]
          return next
        })
        continue
      }

      const controller = new AbortController()
      controllers.push(controller)

      void fetch(`/api/services/${row.service_id}/addons`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Nie udało się pobrać dodatków')
          }

          const data = (await response.json()) as { addons?: unknown[] }
          const addons: AddonOption[] = Array.isArray(data.addons)
            ? data.addons.map((addon) => {
                const entry = addon as { id?: unknown; name?: unknown; price?: unknown; price_delta?: unknown }
                return {
                  id: String(entry.id ?? ''),
                  name: String(entry.name ?? ''),
                  price: toNumber(entry.price ?? entry.price_delta ?? 0),
                }
              })
            : []

          setAddonsByRow((current) => ({
            ...current,
            [row.localId]: addons,
          }))

          setRows((current) =>
            current.map((entry) => {
              if (entry.localId !== row.localId || entry.service_id !== row.service_id) {
                return entry
              }

              const validAddonIds = new Set(addons.map((addon) => addon.id))
              return {
                ...entry,
                addon_ids: entry.addon_ids.filter((addonId) => validAddonIds.has(addonId)),
              }
            })
          )
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === 'AbortError') {
            return
          }

          setAddonsByRow((current) => ({
            ...current,
            [row.localId]: [],
          }))

          setRows((current) =>
            current.map((entry) => {
              if (entry.localId !== row.localId) {
                return entry
              }

              return {
                ...entry,
                addon_ids: [],
              }
            })
          )
        })
    }

    return () => {
      for (const controller of controllers) {
        controller.abort()
      }
    }
  }, [rows.map((row) => row.service_id ?? '').join('|')])

  useEffect(() => {
    const controllers: AbortController[] = []

    for (const row of rows) {
      if (!row.service_id) {
        setEmployeesByRow((current) => {
          if (!current[row.localId]) {
            return current
          }

          const next = { ...current }
          delete next[row.localId]
          return next
        })
        continue
      }

      const controller = new AbortController()
      controllers.push(controller)

      void fetch(`/api/employees?serviceId=${encodeURIComponent(row.service_id)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Nie udało się pobrać pracowników')
          }

          const data = (await response.json()) as { employees?: unknown[] }
          const employees: EmployeeOption[] = Array.isArray(data.employees)
            ? data.employees.map((employee) => {
                const entry = employee as {
                  id?: unknown
                  first_name?: unknown
                  last_name?: unknown
                }
                return {
                  id: String(entry.id ?? ''),
                  first_name: String(entry.first_name ?? ''),
                  last_name: String(entry.last_name ?? ''),
                }
              })
            : []

          setEmployeesByRow((current) => ({
            ...current,
            [row.localId]: employees,
          }))

          setRows((current) =>
            current.map((entry) => {
              if (entry.localId !== row.localId || entry.service_id !== row.service_id) {
                return entry
              }

              if (!entry.employee_id) {
                return entry
              }

              const allowedEmployeeIds = new Set(employees.map((employee) => employee.id))
              return allowedEmployeeIds.has(entry.employee_id)
                ? entry
                : {
                    ...entry,
                    employee_id: null,
                  }
            })
          )
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === 'AbortError') {
            return
          }

          setEmployeesByRow((current) => ({
            ...current,
            [row.localId]: [],
          }))

          setRows((current) =>
            current.map((entry) => {
              if (entry.localId !== row.localId) {
                return entry
              }

              return {
                ...entry,
                employee_id: null,
              }
            })
          )
        })
    }

    return () => {
      for (const controller of controllers) {
        controller.abort()
      }
    }
  }, [rows.map((row) => row.service_id ?? '').join('|')])

  const totals = useMemo(() => {
    let totalPrice = 0
    let totalDuration = 0

    for (const row of rows) {
      const service = availableServices.find((entry) => entry.id === row.service_id)
      if (service) {
        totalPrice += service.price
        totalDuration += service.duration
      }

      const addons = addonsByRow[row.localId] ?? []
      for (const addonId of row.addon_ids) {
        const addon = addons.find((entry) => entry.id === addonId)
        totalPrice += addon?.price ?? 0
      }
    }

    return { totalPrice, totalDuration }
  }, [addonsByRow, availableServices, rows])

  const handleServiceChange = (localId: string, serviceId: string): void => {
    setConflictMessage(null)
    setErrorMessage(null)

    setRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) {
          return row
        }

        const nextServiceId = serviceId === EMPTY_SELECT_VALUE ? null : serviceId
        return {
          ...row,
          service_id: nextServiceId,
          addon_ids: [],
        }
      })
    )
  }

  const handleEmployeeChange = (localId: string, employeeId: string): void => {
    setConflictMessage(null)
    setErrorMessage(null)

    setRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) {
          return row
        }

        return {
          ...row,
          employee_id: employeeId === EMPTY_SELECT_VALUE ? null : employeeId,
        }
      })
    )
  }

  const handleAddonToggle = (localId: string, addonId: string, checked: boolean): void => {
    setConflictMessage(null)
    setErrorMessage(null)

    setRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) {
          return row
        }

        const nextAddonIds = checked
          ? [...new Set([...row.addon_ids, addonId])]
          : row.addon_ids.filter((entry) => entry !== addonId)

        return {
          ...row,
          addon_ids: nextAddonIds,
        }
      })
    )
  }

  const handleAddRow = (): void => {
    setConflictMessage(null)
    setErrorMessage(null)

    const anchor = rows[rows.length - 1]

    setRows((current) => [
      ...current,
      {
        localId: makeLocalId(),
        service_id: null,
        employee_id: anchor?.employee_id ?? null,
        start_time: anchor?.start_time ?? '',
        addon_ids: [],
      },
    ])
  }

  const handleRemoveRow = (localId: string): void => {
    if (rows.length <= 1) {
      return
    }

    setConflictMessage(null)
    setErrorMessage(null)

    setRows((current) => current.filter((row) => row.localId !== localId))
    setAddonsByRow((current) => {
      if (!current[localId]) {
        return current
      }

      const next = { ...current }
      delete next[localId]
      return next
    })
  }

  const parseConflictMessage = async (response: Response): Promise<string> => {
    try {
      const data = (await response.json()) as { error?: string; message?: string }
      return data.error ?? data.message ?? 'Wystąpił konflikt terminu.'
    } catch {
      return 'Wystąpił konflikt terminu.'
    }
  }

  const saveRows = async (saveWithForceOverride: boolean): Promise<void> => {
    if (isSaving) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      for (const row of rows) {
        if (!row.service_id || !row.employee_id) {
          throw new Error('Każdy wiersz musi mieć usługę i pracownika.')
        }
      }

      const existingRows = rows.filter((row) => !!row.id)
      const newRows = rows.filter((row) => !row.id)

      for (const row of existingRows) {
        const payload = {
          service_id: row.service_id,
          employee_id: row.employee_id,
          addon_ids: row.addon_ids,
          ...(saveWithForceOverride ? { force_override: true } : {}),
        }

        const response = await fetch(`/api/bookings/${row.id as string}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (response.status === 409) {
          const message = await parseConflictMessage(response)
          setConflictMessage(message)
          throw new Error('__conflict__')
        }

        if (!response.ok) {
          throw new Error('Nie udało się zapisać zmian dla istniejącej usługi.')
        }
      }

      if (newRows.length > 0) {
        if (!groupId) {
          throw new Error('Brak identyfikatora grupy wizyty dla nowej usługi.')
        }

        for (const row of newRows) {
          const payload = {
            service_id: row.service_id,
            employee_id: row.employee_id,
            start_time: row.start_time,
            addon_ids: row.addon_ids,
            ...(saveWithForceOverride ? { force_override: true } : {}),
          }

          const response = await fetch(`/api/bookings/group/${groupId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (response.status === 409) {
            const message = await parseConflictMessage(response)
            setConflictMessage(message)
            throw new Error('__conflict__')
          }

          if (!response.ok) {
            throw new Error('Nie udało się dodać nowej usługi do wizyty.')
          }
        }
      }

      onSaved()
    } catch (error: unknown) {
      if ((error as Error).message !== '__conflict__') {
        setErrorMessage((error as Error).message || 'Nie udało się zapisać zmian.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {conflictMessage ? (
        <Alert variant="destructive">
          <AlertDescription className="space-y-3">
            <p>{conflictMessage}</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`force-override-${bookingId}`}
                checked={forceOverride}
                onCheckedChange={(checked) => setForceOverride(checked === true)}
              />
              <Label htmlFor={`force-override-${bookingId}`}>Zapisz mimo konfliktu (force override)</Label>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        {rows.map((row, index) => {
          const addons = addonsByRow[row.localId] ?? []
          const rowEmployees =
            row.service_id && employeesByRow[row.localId] ? employeesByRow[row.localId] : availableEmployees

          return (
            <div key={row.localId} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Usługa {index + 1}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 1}
                  onClick={() => handleRemoveRow(row.localId)}
                >
                  Usuń
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usługa</Label>
                  <Select
                    value={row.service_id ?? EMPTY_SELECT_VALUE}
                    onValueChange={(value) => handleServiceChange(row.localId, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz usługę" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>Brak</SelectItem>
                      {availableServices.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pracownik</Label>
                  <Select
                    value={row.employee_id ?? EMPTY_SELECT_VALUE}
                    onValueChange={(value) => handleEmployeeChange(row.localId, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz pracownika" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>Brak</SelectItem>
                      {rowEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {formatEmployeeName(employee)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {row.service_id ? (
                <div className="space-y-2">
                  <Label>Dodatki</Label>
                  {addons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak dostępnych dodatków dla tej usługi.</p>
                  ) : (
                    <div className="space-y-2">
                      {addons.map((addon) => {
                        const checkboxId = `${row.localId}-${addon.id}`
                        const checked = row.addon_ids.includes(addon.id)

                        return (
                          <div key={addon.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={checkboxId}
                                checked={checked}
                                onCheckedChange={(value) =>
                                  handleAddonToggle(row.localId, addon.id, value === true)
                                }
                              />
                              <Label htmlFor={checkboxId}>{addon.name}</Label>
                            </div>
                            <Badge variant="outline">{addon.price.toFixed(2)} zł</Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <Button type="button" variant="outline" onClick={handleAddRow}>
        Dodaj usługę
      </Button>

      <Separator />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">Łączny czas: {totals.totalDuration} min</Badge>
        <Badge variant="secondary">Łączna cena: {totals.totalPrice.toFixed(2)} zł</Badge>
      </div>

      <Button
        type="button"
        onClick={() => {
          if (conflictMessage && !forceOverride) {
            setErrorMessage('Aby zapisać przy konflikcie, zaznacz force override.')
            return
          }

          void saveRows(conflictMessage ? forceOverride : false)
        }}
        disabled={isSaving}
      >
        {isSaving ? 'Zapisywanie...' : 'Zapisz zmiany'}
      </Button>
    </div>
  )
}
