'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS, getServiceCategoryColor } from '@/lib/constants'
import { Clock, User, DollarSign, Sparkles, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  employee: {
    id: string
    first_name: string
    last_name: string | null
  }
  client: {
    id: string
    full_name: string
    phone: string
  } | null
  service: {
    id: string
    name: string
    price: number
  }
}

interface BookingCardProps {
  booking: Booking
  onClick?: () => void
  serviceCategory?: string
  onDelete?: () => void
  employeeColors?: any
}

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
}

export function BookingCard({ booking, onClick, serviceCategory, onDelete, employeeColors }: BookingCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const categoryColor = getServiceCategoryColor(serviceCategory)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click

    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć wizytę?\n\n` +
      `Klient: ${booking.client?.full_name || 'Nieznany klient'}\n` +
      `Data: ${booking.booking_date} ${booking.booking_time}\n` +
      `Usługa: ${booking.service.name}\n\n` +
      `Ta operacja może być cofnięta przez administratora.`
    )

    if (!confirmed) return

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete booking')
      }

      // Call onDelete callback if provided
      if (onDelete) {
        onDelete()
      } else {
        // Refresh the page to show updated list
        router.refresh()
      }
    } catch (error) {
      console.error('Error deleting booking:', error)
      alert('Nie udało się usunąć wizyty. Spróbuj ponownie.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card
      className={`h-full w-full p-2 glass rounded-lg cursor-pointer group transition-all duration-200 hover:shadow-xl hover:z-50 border-l-4 ${employeeColors?.border || categoryColor.border} ${employeeColors?.bg || 'bg-white'} relative overflow-hidden flex flex-col`}
      onClick={onClick}
    >
      <div className="flex-1 flex flex-col justify-between min-h-0">
        <div className="flex items-start justify-between gap-1 overflow-hidden">
          <div className="flex-1 min-w-0 pr-1">
            <p className="font-bold text-gray-900 group-hover:text-purple-600 transition-colors truncate text-[12px] leading-tight">
              {booking.client?.full_name || 'Nieznany klient'}
            </p>
            <p className={`text-[10px] font-semibold ${categoryColor.text} truncate leading-tight`}>
              {booking.service.name}
            </p>
          </div>
          <div className="relative shrink-0 flex items-start justify-end w-[30px] h-[24px]">
            {booking.duration >= 45 && (
              <Badge className={`absolute right-0 top-0 transition-opacity duration-200 group-hover:opacity-0 ${statusColors[booking.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800 border-gray-200'} border text-[9px] px-1 h-4`}>
                {(BOOKING_STATUS_LABELS[booking.status] || booking.status || '').substring(0, 3)}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="absolute right-0 -top-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600 z-10"
              title="Usuń wizytę"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {booking.duration >= 60 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-auto overflow-hidden">
            <div className="flex items-center gap-1 text-gray-600">
              <Clock className="h-2.5 w-2.5 text-purple-600" />
              <span className="text-[10px] font-medium">{booking.booking_time.substring(0, 5)}</span>
            </div>
            {booking.duration >= 90 && (
              <div className="flex items-center gap-1 text-gray-600">
                <DollarSign className="h-2.5 w-2.5 text-purple-600" />
                <span className="text-[10px] font-bold text-purple-600">{(booking.total_price || 0).toFixed(0)} zł</span>
              </div>
            )}
          </div>
        )}

        {booking.notes && booking.duration >= 90 && (
          <p className="text-[9px] text-gray-500 italic mt-1 truncate border-t border-black/5 pt-1">
            {booking.notes}
          </p>
        )}
      </div>
    </Card>
  )
}
