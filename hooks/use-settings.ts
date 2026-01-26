import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SalonSettings } from '@/lib/types/settings'

export function useSettings(salonId: string) {
  return useQuery({
    queryKey: ['settings', salonId],
    queryFn: async () => {
      const res = await fetch(`/api/settings?salonId=${salonId}`)
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json() as Promise<SalonSettings>
    },
    enabled: !!salonId
  })
}

export function useUpdateSettings(salonId: string) {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (updates: Partial<SalonSettings>) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salonId, ...updates })
      })
      if (!res.ok) throw new Error('Failed to update settings')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', salonId] })
      router.refresh()
      toast.success('Ustawienia zapisane')
    },
    onError: () => {
      toast.error('Błąd zapisu')
    }
  })
}

export function useIntegrations(salonId: string) {
  return useQuery({
    queryKey: ['integrations', salonId],
    queryFn: async () => {
      const res = await fetch(`/api/integrations?salonId=${salonId}`)
      if (!res.ok) throw new Error('Failed to fetch integrations')
      return res.json()
    },
    enabled: !!salonId
  })
}