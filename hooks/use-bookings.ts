import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type Booking = {
  id: string
  booking_date: string
  booking_time: string
  duration: number
  status: string
  payment_method: string | null
  base_price: number
  surcharge: number
  total_price: number
  notes: string | null
  equipment_name?: string | null
  employee: {
    id: string
    first_name: string
    last_name: string | null
    avatar_url: string | null
  }
  client: {
    id: string
    full_name: string
    phone: string
  }
  service: {
    id: string
    name: string
    category: string
  }
}

type BookingFilters = {
  startDate?: string
  endDate?: string
  employeeId?: string
  status?: string
  limit?: number
}

type CreateBookingData = {
  employeeId: string
  serviceId: string
  addon_ids?: string[]
  forceOverride?: boolean
  clientId?: string
  clientName?: string
  clientPhone?: string
  bookingDate: string
  bookingTime: string
  duration: number
  notes?: string
  source?: 'manual' | 'booksy' | 'api'
}

type UpdateBookingData = {
  status?: string
  paymentMethod?: string
  surcharge?: number
  notes?: string
  addon_ids?: string[]
  duration?: number
  bookingDate?: string
  bookingTime?: string
  employeeId?: string
}

type UpdateBookingScheduleData = UpdateBookingData & {
  id: string
}

function getCreateBookingErrorMessage(error: any) {
  if (Array.isArray(error?.details)) {
    return error.details.map((d: any) => `${d.field}: ${d.message}`).join(', ')
  }

  if (error?.code === 'CONFLICT') {
    return error.message || 'Wybrany termin jest juz zajety. Wybierz inna godzine lub pracownika.'
  }

  if (error?.error === 'EQUIPMENT_CONFLICT') {
    return error.message || 'Wybrany sprzet jest juz zajety w tym terminie. Wybierz inna godzine.'
  }

  return error?.message || error?.error || 'Nie udalo sie zapisac wizyty'
}

type BookingApiError = Error & {
  status?: number
  data?: any
}

export function useBookings(filters?: BookingFilters) {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.employeeId) params.set('employeeId', filters.employeeId)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.limit) params.set('limit', filters.limit.toString())

  return useQuery({
    queryKey: ['bookings', filters],
    queryFn: async () => {
      const res = await fetch(`/api/bookings?${params}`)
      if (!res.ok) throw new Error('Failed to fetch bookings')
      const data = await res.json()
      return data.bookings as Booking[]
    },
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateBookingData) => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        const message = getCreateBookingErrorMessage(error)
        const apiError = new Error(message) as BookingApiError
        apiError.status = res.status
        apiError.data = error
        throw apiError
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
      toast.success('Rezerwacja utworzona pomyślnie')
    },
    onError: (error: BookingApiError) => {
      if (error.status !== 409) {
        toast.error(error.message)
      }
    },
  })
}

export function useUpdateBooking(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateBookingData) => {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update booking')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
      toast.success('Rezerwacja zaktualizowana')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useCheckAvailability() {
  return useMutation({
    mutationFn: async (data: {
      employeeId: string
      bookingDate: string
      bookingTime: string
    }) => {
      const res = await fetch('/api/bookings/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) throw new Error('Failed to check availability')
      return res.json()
    },
  })
}

export function useUpdateBookingSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateBookingScheduleData) => {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update booking schedule')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
