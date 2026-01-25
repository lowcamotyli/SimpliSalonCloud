import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type Client = {
  id: string
  client_code: string
  full_name: string
  phone: string
  email: string | null
  notes: string | null
  visit_count: number
}

type CreateClientData = {
  fullName: string
  phone: string
  email?: string
  notes?: string
}

export function useClients(search?: string) {
  return useQuery({
    queryKey: ['clients', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const res = await fetch(`/api/clients?${params}`)
      if (!res.ok) throw new Error('Failed to fetch clients')
      const data = await res.json()
      return data.clients as Client[]
    },
    enabled: !search || search.length >= 2,
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateClientData) => {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create client')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Klient dodany pomyślnie')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}