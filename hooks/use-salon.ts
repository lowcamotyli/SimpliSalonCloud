// hooks/use-salon.ts
import { useQuery } from '@tanstack/react-query'

export function useSalon(slug: string) {
  return useQuery({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const res = await fetch(`/api/salons/${slug}`)
      if (!res.ok) throw new Error('Failed to fetch salon')
      return res.json()
    },
    enabled: !!slug
  })
}