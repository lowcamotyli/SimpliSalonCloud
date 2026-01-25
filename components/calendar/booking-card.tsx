'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { Clock, User, DollarSign } from 'lucide-react'

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
}

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function BookingCard({ booking, onClick }: BookingCardProps) {
  return (
    <Card 
      className="p-3 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium">{booking.client.full_name}</p>
            <p className="text-sm text-muted-foreground">{booking.service.name}</p>
          </div>
          <Badge className={statusColors[booking.status as keyof typeof statusColors]}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {booking.booking_time} ({booking.duration}min)
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {booking.employee.first_name}
          </div>
        </div>

        {booking.total_price > 0 && (
          <div className="flex items-center gap-1 text-sm font-medium">
            <DollarSign className="h-3 w-3" />
            {booking.total_price.toFixed(2)} zł
            {booking.payment_method && (
              <span className="text-muted-foreground ml-2">
                ({PAYMENT_METHOD_LABELS[booking.payment_method]})
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
