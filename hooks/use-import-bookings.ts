import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface ImportRow {
  booking_date: string
  booking_time: string
  client_name: string
  client_phone: string
  client_email: string
  employee_id: string
  service_id: string
  duration: number
  price: number
  status: string
  notes: string
}

interface ImportResult {
  imported: number
  skipped: number
  total: number
  errors: Array<{ row: number; reason: string }>
}

export function useImportBookings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rows: ImportRow[]): Promise<ImportResult> => {
      const res = await fetch('/api/bookings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Import failed')
      }

      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      if (data.imported > 0) {
        toast.success(`Zaimportowano ${data.imported} rezerwacji`)
      }
      if (data.skipped > 0) {
        toast.warning(`Pominięto ${data.skipped} wierszy z błędami`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
