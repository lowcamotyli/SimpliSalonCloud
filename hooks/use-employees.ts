import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type Employee = {
  id: string
  employee_code: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  base_threshold: number
  base_salary: number
  commission_rate: number
  active: boolean
}

type CreateEmployeeData = {
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  baseThreshold?: number
  baseSalary?: number
  commissionRate?: number
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const res = await fetch('/api/employees')
      if (!res.ok) throw new Error('Failed to fetch employees')
      const data = await res.json()
      return data.employees as Employee[]
    },
  })
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateEmployeeData) => {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create employee')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Pracownik dodany pomyślnie')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<CreateEmployeeData>) => {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update employee')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Pracownik zaktualizowany')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteEmployee(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete employee')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      toast.success('Pracownik usunięty')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}