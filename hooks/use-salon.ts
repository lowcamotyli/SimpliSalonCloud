import { useQuery } from '@tanstack/react-query'

export function useSalon(slug: string) {
  return useQuery({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const res = await fetch(`/api/salons/${slug}`)
      if (!res.ok) throw new Error('Failed to fetch salon')
      const json = await res.json()
      return json
    },
    enabled: !!slug,
    select: (data) => ({ salon: data }) // <-- DODAJ TO
  })
}