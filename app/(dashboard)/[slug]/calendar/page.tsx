'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, getCurrentWeek, generateWeekDays } from '@/lib/utils/date'
import { addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, format } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock } from 'lucide-react'
import { BookingDialog } from '@/components/calendar/booking-dialog'
import { BookingCard } from '@/components/calendar/booking-card'
import { BUSINESS_HOURS } from '@/lib/constants'

type ViewType = 'day' | 'week' | 'month'

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewType, setViewType] = useState<ViewType>('week')
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string; employeeId?: string } | null>(null)
  const [visibleEmployees, setVisibleEmployees] = useState<Set<string>>(new Set())

  const { data: employees } = useEmployees()

  // Calculate date range based on view type
  const dateRange = useMemo(() => {
    if (viewType === 'day') {
      const dateStr = formatDate(currentDate)
      return { startDate: dateStr, endDate: dateStr }
    } else if (viewType === 'week') {
      const weekDays = generateWeekDays(currentDate)
      return { startDate: formatDate(weekDays[0]), endDate: formatDate(weekDays[6]) }
    } else {
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      return { startDate: formatDate(start), endDate: formatDate(end) }
    }
  }, [viewType, currentDate])

  const { data: bookings, isLoading } = useBookings(dateRange)

  // Initialize visible employees
  useMemo(() => {
    if (employees && visibleEmployees.size === 0) {
      setVisibleEmployees(new Set(employees.map(e => e.id)))
    }
  }, [employees, visibleEmployees.size])

  const handlePrevPeriod = () => {
    if (viewType === 'day') setCurrentDate(addDays(currentDate, -1))
    else if (viewType === 'week') setCurrentDate(addDays(currentDate, -7))
    else setCurrentDate(addDays(currentDate, -30))
  }

  const handleNextPeriod = () => {
    if (viewType === 'day') setCurrentDate(addDays(currentDate, 1))
    else if (viewType === 'week') setCurrentDate(addDays(currentDate, 7))
    else setCurrentDate(addDays(currentDate, 30))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const handleAddBooking = () => {
    setSelectedBooking(null)
    setSelectedSlot(null)
    setIsDialogOpen(true)
  }

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking)
    setSelectedSlot(null)
    setIsDialogOpen(true)
  }

  const handleTimeSlotClick = (date: string, time: string, employeeId?: string) => {
    setSelectedSlot({ date, time, employeeId })
    setSelectedBooking(null)
    setIsDialogOpen(true)
  }

  const toggleEmployee = (employeeId: string) => {
    const newSet = new Set(visibleEmployees)
    if (newSet.has(employeeId)) {
      newSet.delete(employeeId)
    } else {
      newSet.add(employeeId)
    }
    setVisibleEmployees(newSet)
  }

  const getPeriodLabel = () => {
    if (viewType === 'day') {
      return format(currentDate, 'd MMMM yyyy')
    } else if (viewType === 'week') {
      const weekDays = generateWeekDays(currentDate)
      return `${format(weekDays[0], 'd MMM')} - ${format(weekDays[6], 'd MMM yyyy')}`
    } else {
      return format(currentDate, 'MMMM yyyy')
    }
  }

  const timeSlots = Array.from(
    { length: BUSINESS_HOURS.END - BUSINESS_HOURS.START },
    (_, i) => BUSINESS_HOURS.START + i
  )

  const bookingsByEmployeeAndDate: Record<string, Record<string, any[]>> = {}
  employees?.forEach((emp) => {
    bookingsByEmployeeAndDate[emp.id] = {}
  })

  bookings?.forEach((booking) => {
    const empId = booking.employee.id
    const date = booking.booking_date
    if (!bookingsByEmployeeAndDate[empId]) {
      bookingsByEmployeeAndDate[empId] = {}
    }
    if (!bookingsByEmployeeAndDate[empId][date]) {
      bookingsByEmployeeAndDate[empId][date] = []
    }
    bookingsByEmployeeAndDate[empId][date].push(booking)
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Ładowanie...</div>
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold gradient-text">Kalendarz</h1>
            <p className="mt-2 text-gray-600">{getPeriodLabel()}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewType === 'day' ? 'default' : 'outline'}
              onClick={() => setViewType('day')}
              className="rounded-lg"
            >
              Dzień
            </Button>
            <Button
              variant={viewType === 'week' ? 'default' : 'outline'}
              onClick={() => setViewType('week')}
              className="rounded-lg"
            >
              Tydzień
            </Button>
            <Button
              variant={viewType === 'month' ? 'default' : 'outline'}
              onClick={() => setViewType('month')}
              className="rounded-lg"
            >
              Miesiąc
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleToday} className="rounded-lg">
            Dziś
          </Button>
          <Button variant="outline" size="icon" onClick={handlePrevPeriod} className="rounded-lg">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextPeriod} className="rounded-lg">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <Button onClick={handleAddBooking} className="gradient-button rounded-lg shadow-lg">
            <Plus className="mr-2 h-4 w-4" />
            Nowa wizyta
          </Button>
        </div>
      </div>

      {/* Employee Filter */}
      {viewType !== 'month' && (
        <div className="glass p-3 rounded-xl flex items-center gap-2 overflow-x-auto">
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Pracownicy:</span>
          {employees?.map((emp) => (
            <Button
              key={emp.id}
              variant={visibleEmployees.has(emp.id) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleEmployee(emp.id)}
              className="rounded-full text-xs flex-shrink-0"
            >
              {emp.first_name}
            </Button>
          ))}
        </div>
      )}

      {/* Calendar View */}
      <Card className="flex-1 overflow-hidden glass rounded-2xl">
        {viewType === 'day' && <DayView currentDate={currentDate} timeSlots={timeSlots} bookingsByEmployeeAndDate={bookingsByEmployeeAndDate} employees={employees} visibleEmployees={visibleEmployees} onTimeSlotClick={handleTimeSlotClick} onBookingClick={handleBookingClick} />}
        {viewType === 'week' && <WeekView currentDate={currentDate} timeSlots={timeSlots} bookingsByEmployeeAndDate={bookingsByEmployeeAndDate} employees={employees} visibleEmployees={visibleEmployees} onTimeSlotClick={handleTimeSlotClick} onBookingClick={handleBookingClick} />}
        {viewType === 'month' && <MonthView currentDate={currentDate} bookings={bookings} onDayClick={(date: Date) => { setCurrentDate(new Date(date)); setViewType('week'); }} />}
      </Card>

      {/* Booking Dialog */}
      <BookingDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false)
          setSelectedSlot(null)
        }}
        booking={selectedBooking}
        prefilledSlot={selectedSlot}
      />
    </div>
  )
}

// Day View Component
function DayView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick }: any) {
  const dateStr = formatDate(currentDate)
  const now = new Date()
  const isToday = isSameDay(currentDate, now)
  const currentHour = now.getHours()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-[80px_1fr] border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="border-r p-3 text-center">
          <p className="text-xs font-semibold text-gray-600">CZAS</p>
        </div>
        <div className="p-3">
          <p className="font-bold text-gray-900">{format(currentDate, 'd MMMM yyyy')}</p>
        </div>
      </div>

      {/* Time slots */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[80px_1fr]">
          {/* Time column */}
          <div className="border-r bg-gray-50">
            {timeSlots.map((hour) => (
              <div key={hour} className="h-24 border-b p-2 text-xs font-semibold text-gray-600 text-center">
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Bookings column */}
          <div className="relative">
            {/* Current time indicator */}
            {isToday && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-pink-500 z-10"
                style={{ top: `${((currentHour - BUSINESS_HOURS.START + now.getMinutes() / 60) / (BUSINESS_HOURS.END - BUSINESS_HOURS.START)) * 100}%` }}
              >
                <div className="absolute -left-2 -top-1.5 w-4 h-4 rounded-full bg-red-500 shadow-lg" />
              </div>
            )}

            {timeSlots.map((hour) => (
              <div
                key={hour}
                className="h-24 border-b cursor-pointer hover:bg-purple-50/50 transition-colors group relative"
                onClick={() => onTimeSlotClick(dateStr, `${String(hour).padStart(2, '0')}:00`)}
              >
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Badge className="bg-purple-600 text-white text-xs">+ Dodaj wizytę</Badge>
                </div>
              </div>
            ))}

            {/* Bookings */}
            {employees?.map((employee: any) => {
              if (!visibleEmployees.has(employee.id)) return null
              const dayBookings = bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []

              return dayBookings.map((booking: any) => {
                const [hours, minutes] = booking.booking_time.split(':').map(Number)
                const startMinutes = (hours - BUSINESS_HOURS.START) * 60 + minutes
                const top = (startMinutes / (BUSINESS_HOURS.END - BUSINESS_HOURS.START)) * 100
                const height = (booking.duration / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100

                return (
                  <div
                    key={booking.id}
                    className="absolute left-1 right-1 cursor-pointer"
                    style={{ top: `${top}%`, height: `${height}%` }}
                    onClick={() => onBookingClick(booking)}
                  >
                    <BookingCard booking={booking} />
                  </div>
                )
              })
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Week View Component
function WeekView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick }: any) {
  const weekDays = generateWeekDays(currentDate)
  const now = new Date()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-8 border-b bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="border-r p-3 text-center">
          <p className="text-xs font-semibold text-gray-600">CZAS</p>
        </div>
        {weekDays.map((day) => {
          const isToday = isSameDay(day, now)
          return (
            <div key={day.toISOString()} className={`border-r p-3 text-center ${isToday ? 'bg-purple-100' : ''}`}>
              <p className="text-xs font-semibold text-gray-600">{format(day, 'EEE').toUpperCase()}</p>
              <p className={`font-bold ${isToday ? 'text-purple-600' : 'text-gray-900'}`}>{format(day, 'd')}</p>
            </div>
          )
        })}
      </div>

      {/* Time slots */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8">
          {/* Time column */}
          <div className="border-r bg-gray-50">
            {timeSlots.map((hour) => (
              <div key={hour} className="h-20 border-b p-2 text-xs font-semibold text-gray-600 text-center">
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dateStr = formatDate(day)
            const isToday = isSameDay(day, now)

            return (
              <div key={dateStr} className={`relative border-r ${isToday ? 'bg-purple-50/30' : ''}`}>
                {/* Hour lines */}
                {timeSlots.map((hour) => (
                  <div
                    key={hour}
                    className="h-20 border-b cursor-pointer hover:bg-purple-100/50 transition-colors group relative"
                    onClick={() => onTimeSlotClick(dateStr, `${String(hour).padStart(2, '0')}:00`)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge className="bg-purple-600 text-white text-xs">+</Badge>
                    </div>
                  </div>
                ))}

                {/* Bookings */}
                {employees?.map((employee: any) => {
                  if (!visibleEmployees.has(employee.id)) return null
                  const dayBookings = bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []

                  return dayBookings.map((booking: any) => {
                    const [hours, minutes] = booking.booking_time.split(':').map(Number)
                    const startMinutes = (hours - BUSINESS_HOURS.START) * 60 + minutes
                    const top = (startMinutes / 60) * 80
                    const height = (booking.duration / 60) * 80

                    return (
                      <div
                        key={booking.id}
                        className="absolute left-1 right-1 cursor-pointer"
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={() => onBookingClick(booking)}
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
  )
}

// Month View Component
function MonthView({ currentDate, bookings, onDayClick }: any) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const now = new Date()

  const bookingsByDate: Record<string, any[]> = {}
  bookings?.forEach((booking: any) => {
    const date = booking.booking_date
    if (!bookingsByDate[date]) {
      bookingsByDate[date] = []
    }
    bookingsByDate[date].push(booking)
  })

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-2">
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map((day) => (
          <div key={day} className="text-center font-bold text-gray-600 py-2">
            {day}
          </div>
        ))}

        {days.map((day) => {
          const dateStr = formatDate(day)
          const dayBookings = bookingsByDate[dateStr] || []
          const isToday = isSameDay(day, now)
          const isCurrentMonth = isSameMonth(day, currentDate)

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(day)}
              className={`min-h-24 p-2 rounded-lg cursor-pointer transition-all group ${
                isToday
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg'
                  : isCurrentMonth
                  ? 'glass hover:shadow-lg'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              <p className={`font-bold text-sm mb-1 ${isToday ? 'text-white' : ''}`}>{format(day, 'd')}</p>
              <div className="space-y-1">
                {dayBookings.slice(0, 2).map((booking) => (
                  <div
                    key={booking.id}
                    className={`text-xs px-1 py-0.5 rounded truncate ${
                      isToday
                        ? 'bg-white/20'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {booking.booking_time}
                  </div>
                ))}
                {dayBookings.length > 2 && (
                  <p className={`text-xs font-semibold ${isToday ? 'text-white/80' : 'text-purple-600'}`}>
                    +{dayBookings.length - 2} więcej
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
