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
  groupBookings?: Booking[]
}

const statusColors = {
  scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
}

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'

export function BookingCard({ booking, onClick, serviceCategory, onDelete, employeeColors, groupBookings }: BookingCardProps) {
  const isGroup = groupBookings && groupBookings.length > 1
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const categoryColor = getServiceCategoryColor(serviceCategory)

  const startTime = booking.booking_time.substring(0, 5)
  const [hours, minutes] = startTime.split(':').map(Number)
  const endDate = new Date(0, 0, 0, hours, minutes + booking.duration)
  const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click

    const confirmed = window.confirm(
      `Czy na pewno chcesz anulować wizytę?\n\n` +
      `Klient: ${booking.client?.full_name || 'Nieznany klient'}\n` +
      `Data: ${booking.booking_date} ${booking.booking_time}\n` +
      `Usługa: ${booking.service.name}`
    )

    if (!confirmed) return

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (!response.ok) {
        throw new Error('Failed to cancel booking')
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
      alert('Nie udało się anulować wizyty. Spróbuj ponownie.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Card
          className={`theme-booking-card h-full w-full p-2 glass rounded-lg cursor-pointer group transition-all duration-200 hover:shadow-xl hover:z-50 border-l-4 ${employeeColors?.border || categoryColor.border} ${employeeColors?.bg || 'bg-white'} relative overflow-hidden flex flex-col`}
          onClick={onClick}
        >
          <div className="flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-start justify-between gap-1 overflow-hidden">
              <div className="flex-1 min-w-0 pr-1">
                <p className="theme-booking-card-title font-bold text-gray-900 group-hover:text-purple-600 transition-colors truncate text-[12px] leading-tight">
                  {booking.client?.full_name || 'Nieznany klient'}
                  {isGroup && <span className="ml-1 text-[9px] font-semibold text-purple-500 bg-purple-50 px-1 rounded">×{groupBookings!.length}</span>}
                </p>
                {isGroup ? (
                  <div className="flex flex-col gap-0.5">
                    {groupBookings!.map((b) => (
                      <p key={b.id} className={`text-[10px] font-semibold ${categoryColor.text} truncate leading-tight theme-service-name`}>
                        {b.service.name}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className={`theme-booking-card-service text-[10px] font-semibold ${categoryColor.text} truncate leading-tight theme-service-name`}>
                    {booking.service.name}
                  </p>
                )}
              </div>
              <div className="relative shrink-0 flex items-start justify-end w-[30px] h-[24px]">
                {booking.duration >= 45 && (
                  <Badge className={`theme-booking-card-status absolute right-0 top-0 transition-opacity duration-200 group-hover:opacity-0 ${statusColors[booking.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800 border-gray-200'} border text-[9px] px-1 h-4`}>
                    {(BOOKING_STATUS_LABELS[booking.status] || booking.status || '').substring(0, 3)}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="absolute right-0 -top-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600 z-10"
                  title="Anuluj wizytę"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {booking.duration >= 60 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-auto overflow-hidden">
                <div className="theme-booking-card-meta flex items-center gap-1 text-gray-600">
                  <Clock className="theme-booking-card-meta-icon h-2.5 w-2.5 text-purple-600" />
                  <span className="text-[10px] font-medium">{startTime}</span>
                </div>
                {booking.duration >= 90 && (
                  <div className="theme-booking-card-meta flex items-center gap-1 text-gray-600">
                    <DollarSign className="theme-booking-card-meta-icon h-2.5 w-2.5 text-purple-600" />
                    <span className="text-[10px] font-bold text-purple-600">{(booking.total_price || 0).toFixed(0)} zł</span>
                  </div>
                )}
              </div>
            )}

            {booking.notes && booking.duration >= 90 && (
              <p className="theme-booking-card-notes text-[9px] text-gray-500 italic mt-1 truncate border-t border-black/5 pt-1">
                {booking.notes}
              </p>
            )}
          </div>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="right" className="w-80 p-0 overflow-hidden border-none shadow-2xl z-[100]">
        <div className="bg-white text-gray-900 border rounded-lg overflow-hidden shadow-xl">
          <div className={`p-4 border-l-4 ${employeeColors?.border || categoryColor.border} bg-gray-50/80`}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-base text-gray-900 leading-tight">
                  {booking.client?.full_name || 'Nieznany klient'}
                </h4>
                {booking.client?.phone && (
                  <p className="text-xs text-gray-500 font-medium mt-0.5">{booking.client.phone}</p>
                )}
              </div>
              <Badge className={`${statusColors[booking.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'} border-none shadow-sm whitespace-nowrap`}>
                {BOOKING_STATUS_LABELS[booking.status] || booking.status}
              </Badge>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Usługa</Label>
              <p className="text-sm font-bold text-gray-800 bg-gray-50 p-2 rounded border border-gray-100 italic">
                {isGroup ? groupBookings!.map(b => b.service.name).join(' + ') : booking.service.name}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Czas</Label>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <div className="bg-purple-100 p-1 rounded">
                    <Clock className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <div className="flex flex-col">
                    <span>{startTime} - {endTime}</span>
                    <span className="text-gray-400 text-[10px]">{booking.duration} min</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1 block">Pracownik</Label>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <div className="bg-blue-100 p-1 rounded">
                    <User className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <span>{booking.employee.first_name} {booking.employee.last_name || ''}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-2">
               <div className="flex items-center gap-1.5">
                 <div className="bg-emerald-100 p-1 rounded">
                   <DollarSign className="h-4 w-4 text-emerald-600" />
                 </div>
                 <span className="text-xl font-black text-emerald-700">{(booking.total_price || 0).toFixed(2)} <small className="text-xs font-bold opacity-70">PLN</small></span>
               </div>
            </div>

            {booking.notes && (
              <div className="bg-amber-50/80 p-3 rounded-lg border border-amber-100 shadow-inner">
                <Label className="text-[10px] uppercase tracking-widest text-amber-600/70 font-bold mb-1 block">Notatki</Label>
                <p className="text-xs text-amber-900 leading-relaxed font-medium">{booking.notes}</p>
              </div>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
