'use client'

import { useState } from 'react'
import { useBookings } from '@/hooks/use-bookings'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { Search, Calendar, User, DollarSign } from 'lucide-react'
import { BookingDialog } from '@/components/calendar/booking-dialog'

export default function BookingsPage() {
  const [search, setSearch] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: bookings, isLoading } = useBookings()

  const filteredBookings = bookings?.filter(
    (booking) =>
      booking.client.full_name.toLowerCase().includes(search.toLowerCase()) ||
      booking.service.name.toLowerCase().includes(search.toLowerCase()) ||
      booking.employee.first_name.toLowerCase().includes(search.toLowerCase())
  )

  const statusColors = {
    scheduled: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Rezerwacje</h1>
        <p className="mt-2 text-gray-600">Wszystkie wizyty w salonie</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj po kliencie, usłudze lub pracowniku..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={() => {
            setSelectedBooking(null)
            setIsDialogOpen(true)
          }}
        >
          + Nowa wizyta
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Ładowanie...</p>
        </div>
      ) : filteredBookings && filteredBookings.length > 0 ? (
        <div className="grid gap-4">
          {filteredBookings.map((booking) => (
            <Card
              key={booking.id}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedBooking(booking)
                setIsDialogOpen(true)
              }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {booking.client.full_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {booking.client.phone}
                      </p>
                    </div>
                    <Badge
                      className={
                        statusColors[
                          booking.status as keyof typeof statusColors
                        ]
                      }
                    >
                      {BOOKING_STATUS_LABELS[booking.status]}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-gray-600">Data i godzina</p>
                        <p className="font-medium">
                          {booking.booking_date} {booking.booking_time}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-gray-600">Pracownik</p>
                        <p className="font-medium">
                          {booking.employee.first_name}{' '}
                          {booking.employee.last_name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-gray-600">Cena</p>
                        <p className="font-medium">
                          {booking.total_price.toFixed(2)} zł
                          {booking.payment_method && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({PAYMENT_METHOD_LABELS[booking.payment_method]})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-700">
                      {booking.service.name}
                    </p>
                    <span className="text-sm text-gray-500">
                      • {booking.duration} min
                    </span>
                  </div>

                  {booking.notes && (
                    <p className="text-sm text-gray-600 italic">
                      {booking.notes}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">
            {search ? 'Brak wyników' : 'Brak rezerwacji'}
          </p>
        </div>
      )}

      <BookingDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false)
          setSelectedBooking(null)
        }}
        booking={selectedBooking}
      />
    </div>
  )
}