'use client'

import { useState } from 'react'
import { useBookings, useCreateBooking, useUpdateBooking } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useClients } from '@/hooks/use-clients'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, getCurrentWeek, generateWeekDays } from '@/lib/utils/date'
import { addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { BookingDialog } from '@/components/calendar/booking-dialog'
import { BookingCard } from '@/components/calendar/booking-card'
import { BUSINESS_HOURS } from '@/lib/constants'

export default function CalendarPage() {
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek().start)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const weekDays = generateWeekDays(currentWeek)
  const startDate = formatDate(weekDays[0])
  const endDate = formatDate(weekDays[6])

  const { data: bookings, isLoading } = useBookings({ startDate, endDate })
  const { data: employees } = useEmployees()

  const handlePrevWeek = () => {
    setCurrentWeek(addDays(currentWeek, -7))
  }

  const handleNextWeek = () => {
    setCurrentWeek(addDays(currentWeek, 7))
  }

  const handleToday = () => {
    setCurrentWeek(getCurrentWeek().start)
  }

  const handleAddBooking = () => {
    setSelectedBooking(null)
    setIsDialogOpen(true)
  }

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking)
    setIsDialogOpen(true)
  }

  // Generate time slots (8:00 - 20:00)
  const timeSlots = Array.from(
    { length: BUSINESS_HOURS.END - BUSINESS_HOURS.START },
    (_, i) => BUSINESS_HOURS.START + i
  )

  // Group bookings by employee and date
  const bookingsByEmployeeAndDate: Record<string, Record<string, any[]>> = {}
  
  employees?.forEach((emp) => {
    bookingsByEmployeeAndDate[emp.id] = {}
    weekDays.forEach((day) => {
      bookingsByEmployeeAndDate[emp.id][formatDate(day)] = []
    })
  })

  bookings?.forEach((booking) => {
    const empId = booking.employee.id
    const date = booking.booking_date
    
    if (bookingsByEmployeeAndDate[empId]?.[date]) {
      bookingsByEmployeeAndDate[empId][date].push(booking)
    }
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Ładowanie...</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kalendarz</h1>
          <p className="mt-2 text-gray-600">
            {formatDate(weekDays[0], 'd MMM')} - {formatDate(weekDays[6], 'd MMM yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleToday}>
            Dziś
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={handleAddBooking}>
            <Plus className="mr-2 h-4 w-4" />
            Nowa wizyta
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <Card className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b bg-gray-50">
            <div className="border-r p-2 text-center text-sm font-medium text-gray-600">
              Czas
            </div>
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="border-r p-2 text-center"
              >
                <div className="text-sm font-medium text-gray-900">
                  {formatDate(day, 'EEE')}
                </div>
                <div className="text-xs text-gray-600">
                  {formatDate(day, 'd MMM')}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-8">
              {/* Time column */}
              <div className="border-r">
                {timeSlots.map((hour) => (
                  <div
                    key={hour}
                    className="h-20 border-b p-2 text-xs text-gray-500"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dateStr = formatDate(day)
                
                return (
                  <div key={dateStr} className="relative border-r">
                    {/* Hour lines */}
                    {timeSlots.map((hour) => (
                      <div key={hour} className="h-20 border-b" />
                    ))}

                    {/* Bookings for each employee */}
                    {employees?.map((employee) => {
                      const dayBookings = bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []
                      
                      return dayBookings.map((booking) => {
                        const [hours, minutes] = booking.booking_time.split(':').map(Number)
                        const startMinutes = (hours - BUSINESS_HOURS.START) * 60 + minutes
                        const top = (startMinutes / 60) * 80 // 80px per hour
                        const height = (booking.duration / 60) * 80

                        return (
                          <div
                            key={booking.id}
                            className="absolute left-1 right-1 cursor-pointer"
                            style={{ top: `${top}px`, height: `${height}px` }}
                            onClick={() => handleBookingClick(booking)}
                          >
                            <BookingCard booking={booking} />
                          </div>
                        )
                      })
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Booking Dialog */}
      <BookingDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        booking={selectedBooking}
      />
    </div>
  )
}