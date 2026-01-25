import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function usePayroll(month: string) {
  return useQuery({
    queryKey: ['payroll', month],
    queryFn: async () => {
      const res = await fetch(`/api/payroll?month=${month}`)
      if (!res.ok) throw new Error('Failed to fetch payroll')
      return res.json()
    },
    enabled: !!month,
  })
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (month: string) => {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate payroll')
      }

      return res.json()
    },
    onSuccess: (data, month) => {
      queryClient.invalidateQueries({ queryKey: ['payroll', month] })
      toast.success('Wynagrodzenia wygenerowane pomyślnie')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}