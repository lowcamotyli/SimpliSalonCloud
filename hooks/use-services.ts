import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ServicePriceType } from '@/lib/services/price-types'

type Service = {
  id: string
  name: string
  price: number
  price_type: ServicePriceType
  duration: number
  surchargeAllowed: boolean
}

type Subcategory = {
  name: string
  services: Service[]
}

type ServiceCategory = {
  category: string
  subcategories: Subcategory[]
}

interface CreateServiceData {
  category: string
  subcategory: string
  name: string
  price: number
  price_type?: ServicePriceType
  duration: number
  active?: boolean
}

interface UpdateServiceData {
  id: string
  category?: string
  subcategory?: string
  name?: string
  price?: number
  price_type?: ServicePriceType
  duration?: number
  active?: boolean
}

// GET all services
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await fetch('/api/services')
      if (!res.ok) throw new Error('Failed to fetch services')
      const data = await res.json()
      return data.services as ServiceCategory[]
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
