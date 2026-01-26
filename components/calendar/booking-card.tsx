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
  }
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
}

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
}

export function BookingCard({ booking, onClick, serviceCategory, onDelete }: BookingCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const categoryColor = getServiceCategoryColor(serviceCategory)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click

    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć wizytę?\n\n` +
      `Klient: ${booking.client.full_name}\n` +
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
      className={`p-4 glass rounded-xl cursor-pointer group transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 border-l-4 ${categoryColor.border} relative`}
      onClick={onClick}
    >
      {/* Delete Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"
        title="Usuń wizytę"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 group-hover:text-purple-600 transition-colors">{booking.client.full_name}</p>
            <p className={`text-xs font-semibold ${categoryColor.text} mt-1`}>{booking.service.name}</p>
          </div>
          <Badge className={`${statusColors[booking.status as keyof typeof statusColors]} border`}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1 text-gray-600">
            <Clock className="h-3 w-3 text-purple-600" />
            <span className="font-medium">{booking.booking_time}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <User className="h-3 w-3 text-purple-600" />
            <span className="font-medium truncate">{booking.employee.first_name}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <DollarSign className="h-3 w-3 text-purple-600" />
            <span className="font-bold text-purple-600">{booking.total_price.toFixed(2)} zł</span>
          </div>
        </div>

        {booking.notes && (
          <p className="text-xs text-gray-500 italic border-t border-white/20 pt-2">
            {booking.notes}
          </p>
        )}

        {booking.status === 'confirmed' && (
          <div className="flex items-center gap-1 text-xs text-green-600 font-semibold">
            <Sparkles className="h-3 w-3" />
            Potwierdzona
          </div>
        )}
      </div>
    </Card>
  )
}
