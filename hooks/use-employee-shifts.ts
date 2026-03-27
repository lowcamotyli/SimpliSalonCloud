'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface EmployeeShift {
  id: string
  employee_id: string
  shift_template_id: string | null
  date: string
  start_time: string
  end_time: string
  notes: string | null
  template?: { name: string; color: string } | null
}

export interface AddShiftInput {
  date: string
  shift_template_id?: string
  start_time?: string
  end_time?: string
  notes?: string
}

type UseEmployeeShiftsResult = {
  shifts: EmployeeShift[]
  isLoading: boolean
  error: Error | null
  addShift: (data: AddShiftInput) => Promise<EmployeeShift>
  deleteShift: (shiftId: string) => Promise<void>
}

function normalizeTime(value: string | undefined): string {
  if (!value) {
    return '00:00'
  }

  return value.slice(0, 5)
}

export function useEmployeeShifts(
  employeeId: string,
  from: string,
  to: string
): UseEmployeeShiftsResult {
  const queryClient = useQueryClient()
  const queryKey = ['employee-shifts', employeeId, from, to] as const

  const {
    data: shifts,
    isLoading,
    error: queryError,
  } = useQuery<EmployeeShift[], Error>({
    queryKey,
    enabled: employeeId.length > 0 && from.length > 0 && to.length > 0,
    queryFn: async (): Promise<EmployeeShift[]> => {
      const response = await fetch(
        `/api/employees/${employeeId}/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac zmian pracownika')
      }

      const json = (await response.json()) as { shifts?: EmployeeShift[] }
      return json.shifts ?? []
    },
  })

  const addShiftMutation = useMutation<
    EmployeeShift,
    Error,
    AddShiftInput,
    { previous: EmployeeShift[] | undefined; optimisticId: string }
  >({
    mutationFn: async (data): Promise<EmployeeShift> => {
      const response = await fetch(`/api/employees/${employeeId}/shifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie dodac zmiany')
      }

      const json = (await response.json()) as { shift: EmployeeShift }
      return json.shift
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<EmployeeShift[]>(queryKey)
      const optimisticId = `temp-${Date.now()}`

      const optimisticShift: EmployeeShift = {
        id: optimisticId,
        employee_id: employeeId,
        shift_template_id: data.shift_template_id ?? null,
        date: data.date,
        start_time: normalizeTime(data.start_time),
        end_time: normalizeTime(data.end_time),
        notes: data.notes ?? null,
        template: null,
      }

      queryClient.setQueryData<EmployeeShift[]>(queryKey, (current) => {
        const next = current ?? []
        return [...next, optimisticShift].sort((a, b) => a.date.localeCompare(b.date))
      })

      return { previous, optimisticId }
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSuccess: (createdShift, _variables, context) => {
      queryClient.setQueryData<EmployeeShift[]>(queryKey, (current) => {
        if (!current) {
          return [createdShift]
        }

        return current
          .map((shift) => (shift.id === context.optimisticId ? createdShift : shift))
          .sort((a, b) => a.date.localeCompare(b.date))
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteShiftMutation = useMutation<
    void,
    Error,
    string,
    { previous: EmployeeShift[] | undefined }
  >({
    mutationFn: async (shiftId): Promise<void> => {
      const response = await fetch(`/api/employees/${employeeId}/shifts/${shiftId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie usunac zmiany')
      }
    },
    onMutate: async (shiftId) => {
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<EmployeeShift[]>(queryKey)

      queryClient.setQueryData<EmployeeShift[]>(queryKey, (current) => {
        if (!current) {
          return []
        }

        return current.filter((shift) => shift.id !== shiftId)
      })

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const addShift = async (data: AddShiftInput): Promise<EmployeeShift> => {
    return addShiftMutation.mutateAsync(data)
  }

  const deleteShift = async (shiftId: string): Promise<void> => {
    await deleteShiftMutation.mutateAsync(shiftId)
  }

  return {
    shifts: shifts ?? [],
    isLoading,
    error: queryError ?? addShiftMutation.error ?? deleteShiftMutation.error ?? null,
    addShift,
    deleteShift,
  }
}
