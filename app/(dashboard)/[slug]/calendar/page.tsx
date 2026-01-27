'use client'

import { useState, useMemo, useEffect } from 'react'
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

const EMPLOYEE_COLORS = [
  { bg: 'bg-purple-50', text: 'text-purple-700', accent: 'text-purple-600', bgAccent: 'bg-purple-600', border: 'border-purple-200', gradient: 'from-purple-50 to-purple-100/50' },
  { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'text-blue-600', bgAccent: 'bg-blue-600', border: 'border-blue-200', gradient: 'from-blue-50 to-blue-100/50' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'text-emerald-600', bgAccent: 'bg-emerald-600', border: 'border-emerald-200', gradient: 'from-emerald-50 to-emerald-100/50' },
  { bg: 'bg-amber-50', text: 'text-amber-700', accent: 'text-amber-600', bgAccent: 'bg-amber-600', border: 'border-amber-200', gradient: 'from-amber-50 to-amber-100/50' },
  { bg: 'bg-rose-50', text: 'text-rose-700', accent: 'text-rose-600', bgAccent: 'bg-rose-600', border: 'border-rose-200', gradient: 'from-rose-50 to-rose-100/50' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'text-indigo-600', bgAccent: 'bg-indigo-600', border: 'border-indigo-200', gradient: 'from-indigo-50 to-indigo-100/50' },
]

const getEmployeeColor = (index: number) => EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length]

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
  useEffect(() => {
    if (employees && visibleEmployees.size === 0) {
      setVisibleEmployees(new Set(employees.map(e => e.id)))
    }
  }, [employees])

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

  const handleDayClick = (day: Date) => {
    setCurrentDate(day)
    setViewType('week')
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
    const empId = booking.employee?.id
    if (!empId) return

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
            <h1 className="text-4xl font-bold gradient-text pb-1">Kalendarz</h1>
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
          {employees?.map((emp, idx) => {
            const colors = getEmployeeColor(idx)
            const isVisible = visibleEmployees.has(emp.id)
            return (
              <Button
                key={emp.id}
                variant="outline"
                size="sm"
                onClick={() => toggleEmployee(emp.id)}
                className={`rounded-full text-xs flex-shrink-0 transition-all ${isVisible
                  ? `${colors.bgAccent} text-white border-transparent shadow-md scale-105`
                  : 'hover:bg-gray-100'
                  }`}
              >
                {emp.first_name}
              </Button>
            )
          })}
        </div>
      )}

      {/* Calendar View */}
      <Card className="flex-1 overflow-hidden glass rounded-2xl">
        {viewType === 'day' && <DayView currentDate={currentDate} timeSlots={timeSlots} bookingsByEmployeeAndDate={bookingsByEmployeeAndDate} employees={employees} visibleEmployees={visibleEmployees} onTimeSlotClick={handleTimeSlotClick} onBookingClick={handleBookingClick} getEmployeeColor={getEmployeeColor} />}
        {viewType === 'week' && <WeekView currentDate={currentDate} timeSlots={timeSlots} bookingsByEmployeeAndDate={bookingsByEmployeeAndDate} employees={employees} visibleEmployees={visibleEmployees} onTimeSlotClick={handleTimeSlotClick} onBookingClick={handleBookingClick} getEmployeeColor={getEmployeeColor} />}
        {viewType === 'month' && <MonthView currentDate={currentDate} bookings={bookings} onDayClick={handleDayClick} onBookingClick={handleBookingClick} employees={employees} getEmployeeColor={getEmployeeColor} />}
      </Card>

      {/* Booking Dialog */}
      {isDialogOpen && (
        <BookingDialog
          isOpen={isDialogOpen}
          onClose={() => {
            setIsDialogOpen(false)
            setSelectedSlot(null)
          }}
          booking={selectedBooking}
          prefilledSlot={selectedSlot}
        />
      )}
    </div>
  )
}

// Day View Component
function DayView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick, getEmployeeColor }: any) {
  const dateStr = formatDate(currentDate)
  const now = new Date()
  const isToday = isSameDay(currentDate, now)
  const currentHour = now.getHours()

  const visibleEmployeesList = employees?.filter((emp: any) => visibleEmployees.has(emp.id)) || []
  const columnCount = visibleEmployeesList.length

  return (
    <div className="flex h-full flex-col min-w-0 overflow-hidden">
      {/* Header with Employee Columns */}
      <div
        className="grid border-b bg-white sticky top-0 z-30"
        style={{ gridTemplateColumns: `80px repeat(${Math.max(1, columnCount)}, 1fr)` }}
      >
        <div className="border-r p-3 text-center flex items-center justify-center bg-gray-50/50">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Czas</p>
        </div>
        {visibleEmployeesList.map((emp: any) => {
          const empIdx = employees.findIndex((e: any) => e.id === emp.id)
          const colors = getEmployeeColor(empIdx)
          return (
            <div key={emp.id} className={`p-3 border-r text-center overflow-hidden bg-gradient-to-b ${colors.gradient}`}>
              <p className={`font-bold truncate text-sm ${colors.text}`}>{emp.first_name} {emp.last_name}</p>
            </div>
          )
        })}
        {columnCount === 0 && <div className="p-3 text-center text-gray-500 text-sm">Brak wybranych pracowników</div>}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `80px repeat(${Math.max(1, columnCount)}, 1fr)`, minHeight: '100%' }}
        >
          {/* Time column - Sticky left */}
          <div className="border-r bg-gray-50/80 sticky left-0 z-20">
            {timeSlots.map((hour: number) => (
              <div key={hour} className="h-24 border-b p-2 text-[11px] font-bold text-gray-500 text-center flex items-center justify-center">
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Employee Columns */}
          {visibleEmployeesList.map((employee: any) => {
            const empIdx = employees.findIndex((e: any) => e.id === employee.id)
            const colors = getEmployeeColor(empIdx)
            return (
              <div key={employee.id} className={`relative border-r hover:${colors.bg}/30 transition-colors`}>
                {/* Hour click targets */}
                {timeSlots.map((hour: number) => (
                  <div
                    key={hour}
                    className="h-24 border-b cursor-pointer transition-colors group relative"
                    onClick={() => onTimeSlotClick(dateStr, `${String(hour).padStart(2, '0')}:00`, employee.id)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Badge className={`${colors.bgAccent} text-white text-[10px] shadow-sm`}>+ Dodaj</Badge>
                    </div>
                  </div>
                ))}

                {/* Bookings for this specific employee */}
                {(bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []).map((booking: any, index: number, allBookings: any[]) => {
                  const timeStr = booking.booking_time
                  if (!timeStr) return null

                  const [hours, minutes] = timeStr.split(':').map(Number)
                  const startMinutes = (hours - BUSINESS_HOURS.START) * 60 + (minutes || 0)

                  // Detect if this booking overlaps with ANY other booking in the same set
                  const overlappingBookings = allBookings.filter((other, idx) => {
                    if (idx === index) return false
                    const [oH, oM] = other.booking_time.split(':').map(Number)
                    const oStart = (oH - BUSINESS_HOURS.START) * 60 + (oM || 0)
                    const oEnd = oStart + other.duration
                    return (startMinutes < oEnd && (startMinutes + booking.duration) > oStart)
                  })

                  // Count how many of those overlapping bookings started BEFORE this one
                  const previousOverlaps = allBookings.slice(0, index).filter(prev => {
                    const [pH, pM] = prev.booking_time.split(':').map(Number)
                    const pStart = (pH - BUSINESS_HOURS.START) * 60 + (pM || 0)
                    const pEnd = pStart + prev.duration
                    return (startMinutes < pEnd && (startMinutes + booking.duration) > pStart)
                  })

                  const top = (startMinutes / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100
                  const height = (booking.duration / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100

                  // If there's an overlap, use side-by-side logic
                  // width: 100% / (max simultaneous overlaps) would be ideal, 
                  // but let's go with a simpler: if overlap, width 65%, offset 30% per level
                  const hasOverlap = overlappingBookings.length > 0
                  const width = hasOverlap ? 65 : 96
                  const offset = previousOverlaps.length * 30

                  return (
                    <div
                      key={booking.id}
                      className="absolute cursor-pointer transition-all hover:!z-50 hover:scale-[1.02] p-[1px] group/card"
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        minHeight: '34px',
                        left: `${offset}%`,
                        width: `${width}%`,
                        zIndex: 10 + previousOverlaps.length
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onBookingClick(booking)
                      }}
                    >
                      <BookingCard
                        booking={booking}
                        employeeColors={colors}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Current time indicator - overlay across all columns */}
          {isToday && (
            <div
              className="absolute left-[80px] right-0 h-0.5 bg-red-500/80 z-40 pointer-events-none"
              style={{ top: `${((currentHour - BUSINESS_HOURS.START + now.getMinutes() / 60) / (BUSINESS_HOURS.END - BUSINESS_HOURS.START)) * 100}%` }}
            >
              <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500 shadow-md ring-2 ring-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Week View Component
function WeekView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick, getEmployeeColor }: any) {
  const weekDays = generateWeekDays(currentDate)
  const now = new Date()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-8 border-b bg-slate-50/50">
        <div className="border-r p-3 text-center">
          <p className="text-xs font-semibold text-gray-600">CZAS</p>
        </div>
        {weekDays.map((day) => {
          const isToday = isSameDay(day, now)
          return (
            <div key={day.toISOString()} className={`border-r p-3 text-center ${isToday ? 'bg-primary/5' : ''}`}>
              <p className="text-xs font-semibold text-gray-600">{format(day, 'EEE').toUpperCase()}</p>
              <p className={`font-bold ${isToday ? 'text-primary' : 'text-gray-900'}`}>{format(day, 'd')}</p>
            </div>
          )
        })}
      </div>

      {/* Time slots */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8">
          {/* Time column */}
          <div className="border-r bg-gray-50">
            {timeSlots.map((hour: number) => (
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
              <div key={dateStr} className={`relative border-r ${isToday ? 'bg-primary/5' : ''}`}>
                {/* Hour lines */}
                {timeSlots.map((hour: number) => (
                  <div
                    key={hour}
                    className="h-20 border-b cursor-pointer hover:bg-slate-50 transition-colors group relative"
                    onClick={() => onTimeSlotClick(dateStr, `${String(hour).padStart(2, '0')}:00`)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge className="bg-primary text-white text-xs">+</Badge>
                    </div>
                  </div>
                ))}

                {/* Bookings */}
                {employees?.map((employee: any) => {
                  if (!visibleEmployees.has(employee.id)) return null
                  const dayBookings = bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []

                  return dayBookings.map((booking: any, index: number, allBookings: any[]) => {
                    const [hours, minutes] = booking.booking_time.split(':').map(Number)
                    const startMinutes = (hours - BUSINESS_HOURS.START) * 60 + minutes

                    // Detect if this booking overlaps with ANY other booking in the same set
                    const overlappingBookings = allBookings.filter((other, idx) => {
                      if (idx === index) return false
                      const [oH, oM] = other.booking_time.split(':').map(Number)
                      const oStart = (oH - BUSINESS_HOURS.START) * 60 + (oM || 0)
                      const oEnd = oStart + other.duration
                      return (startMinutes < oEnd && (startMinutes + booking.duration) > oStart)
                    })

                    // Count how many of those overlapping bookings started BEFORE this one
                    const previousOverlaps = allBookings.slice(0, index).filter(prev => {
                      const [pH, pM] = prev.booking_time.split(':').map(Number)
                      const pStart = (pH - BUSINESS_HOURS.START) * 60 + (pM || 0)
                      const pEnd = pStart + prev.duration
                      return (startMinutes < pEnd && (startMinutes + booking.duration) > pStart)
                    })

                    const top = (startMinutes / 60) * 80
                    const height = (booking.duration / 60) * 80

                    const hasOverlap = overlappingBookings.length > 0
                    const width = hasOverlap ? 65 : 96
                    const offset = previousOverlaps.length * 30

                    return (
                      <div
                        key={booking.id}
                        className="absolute cursor-pointer transition-all hover:!z-50 hover:scale-[1.02] p-[1px] group/card"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `${offset}%`,
                          width: `${width}%`,
                          zIndex: 10 + previousOverlaps.length
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onBookingClick(booking)
                        }}
                      >
                        <BookingCard
                          booking={booking}
                          employeeColors={getEmployeeColor(employees.findIndex((e: any) => e.id === employee.id))}
                        />
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
function MonthView({ currentDate, bookings, onDayClick, onBookingClick, employees, getEmployeeColor }: any) {
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
              className={`min-h-24 p-2 rounded-lg cursor-pointer transition-all group ${isToday
                ? 'bg-primary text-primary-foreground shadow-lg scale-[1.02] z-10'
                : isCurrentMonth
                  ? 'glass hover:shadow-lg'
                  : 'bg-gray-50 text-gray-400'
                }`}
            >
              <p className={`font-bold text-sm mb-1 ${isToday ? 'text-white' : ''}`}>{format(day, 'd')}</p>
              <div className="relative mt-1">
                {dayBookings.slice(0, 4).map((booking: any, idx: number) => {
                  const empIdx = employees.findIndex((e: any) => e.id === booking.employee?.id)
                  const colors = getEmployeeColor(empIdx !== -1 ? empIdx : 0)

                  return (
                    <div
                      key={booking.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded shadow-sm border-l-2 truncate transition-transform hover:scale-105 hover:z-30 mb-0.5 ${isToday
                        ? 'bg-white/30 border-white text-white'
                        : `${colors.bg} ${colors.border} ${colors.text}`
                        }`}
                      style={{
                        marginLeft: `${idx * 4}px`, // Schodkowanie (staggering)
                        width: `calc(100% - ${idx * 4}px)`
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onBookingClick(booking)
                      }}
                    >
                      <span className="font-bold">{booking.booking_time.substring(0, 5)}</span>
                      <span className="ml-1 opacity-80">{booking.client?.full_name?.split(' ')[0]}</span>
                    </div>
                  )
                })}
                {dayBookings.length > 4 && (
                  <p className={`text-[10px] font-bold mt-1 text-center ${isToday ? 'text-white/90' : 'text-primary'}`}>
                    + {dayBookings.length - 4} więcej
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
