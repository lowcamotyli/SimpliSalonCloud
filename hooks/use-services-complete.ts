import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

interface Service {
  id: string
  salon_id: string
  category: string
  subcategory: string
  name: string
  price: number
  duration: number
  is_active: boolean
  created_at: string
}

interface CreateServiceData {
  category: string
  subcategory: string
  name: string
  price: number
  duration: number
  is_active?: boolean
}

interface UpdateServiceData {
  id: string
  category?: string
  subcategory?: string
  name?: string
  price?: number
  duration?: number
  is_active?: boolean
}

// GET all services
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await fetch('/api/services')
      if (!response.ok) {
        throw new Error('Failed to fetch services')
      }
      const data = await response.json()
      return data
    },
  })
}

// CREATE service
export function useCreateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serviceData: CreateServiceData) => {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create service')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

// UPDATE service
export function useUpdateService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateServiceData) => {
      const response = await fetch(`/api/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update service')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

// DELETE service
export function useDeleteService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (serviceId: string) => {
      const response = await fetch(`/api/services/${serviceId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete service')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}
