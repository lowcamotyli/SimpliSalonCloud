import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type Client = {
  id: string
  client_code: string
  full_name: string
  phone: string | null
  email: string | null
  notes: string | null
  visit_count: number
  last_visit_at: string | null
  blacklist_status: string
  tags?: string[] | null
}

type CreateClientData = {
  fullName: string
  phone: string
  email?: string
  notes?: string
}

export function useClients(search?: string, tags: string[] = [], sort?: string, order?: string) {
  return useQuery({
    queryKey: ['clients', search, tags, sort, order],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (tags.length > 0) params.set('tags', tags.join(','))
      if (sort) params.set('sort', sort)
      if (order) params.set('order', order)

      const res = await fetch(`/api/clients?${params}`)
      if (!res.ok) throw new Error('Failed to fetch clients')
      const data = await res.json()
      return data.clients as Client[]
    },
    enabled: tags.length > 0 || !search || search.length >= 2,
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
        const message = error.details?.[0]?.message || error.message || 'Nie udało się dodać klienta'
        throw new Error(message)
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
