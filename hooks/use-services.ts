import { useQuery } from '@tanstack/react-query'

type Service = {
  id: string
  name: string
  price: number
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