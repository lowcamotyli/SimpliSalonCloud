'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useBookings, useUpdateBookingSchedule } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatDate, generateWeekDays } from '@/lib/utils/date'
import { addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { BookingCard } from '@/components/calendar/booking-card'
import { AbsenceDialog } from '@/components/calendar/absence-dialog'
import { TimeReservationDialog } from '@/components/calendar/time-reservation-dialog'
import { BUSINESS_HOURS } from '@/lib/constants'
import { toast } from 'sonner'
import MiniCalendar from './mini-calendar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const BookingDialog = dynamic(() => import('./booking-dialog').then(mod => mod.BookingDialog), {
  ssr: false
})

type ViewType = 'day' | 'week' | 'month'

const EMPLOYEE_COLORS = [
  { bg: 'bg-purple-50', text: 'text-purple-700', accent: 'text-purple-600', bgAccent: 'bg-purple-600', border: 'border-purple-200', gradient: 'from-purple-50 to-purple-100/50' },
  { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'text-blue-600', bgAccent: 'bg-blue-600', border: 'border-blue-200', gradient: 'from-blue-50 to-blue-100/50' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'text-emerald-600', bgAccent: 'bg-emerald-600', border: 'border-emerald-200', gradient: 'from-emerald-50 to-emerald-100/50' },
  { bg: 'bg-amber-50', text: 'text-amber-700', accent: 'text-amber-600', bgAccent: 'bg-amber-600', border: 'border-amber-200', gradient: 'from-amber-50 to-amber-100/50' },
  { bg: 'bg-rose-50', text: 'text-rose-700', accent: 'text-rose-600', bgAccent: 'bg-rose-600', border: 'border-rose-200', gradient: 'from-rose-50 to-rose-100/50' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'text-indigo-600', bgAccent: 'bg-indigo-600', border: 'border-indigo-200', gradient: 'from-indigo-50 to-indigo-100/50' },
]

const SLOT_MINUTES = 5

const getEmployeeColor = (index: number) => EMPLOYEE_COLORS[index % EMPLOYEE_COLORS.length]

const timeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

const minutesToTime = (minutes: number) => {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function buildCalendarEntries(dayBookings: any[], previewDurations: Record<string, number>) {
  const rendered = new Set<string>()
  const entries: Array<{
    booking: any
    groupBookings?: any[]
    displayDuration: number
  }> = []

  for (const booking of dayBookings) {
    const groupId = booking.visit_group_id
    if (groupId && rendered.has(groupId)) continue

    if (groupId) {
      const groupBookings = dayBookings
        .filter((b: any) => b.visit_group_id === groupId)
        .sort((a: any, b: any) => timeToMinutes(a.booking_time) - timeToMinutes(b.booking_time))

      const firstStart = timeToMinutes(groupBookings[0].booking_time)
      const lastEnd = Math.max(...groupBookings.map((b: any) =>
        timeToMinutes(b.booking_time) + (previewDurations[b.id] ?? b.duration)
      ))

      rendered.add(groupId)
      entries.push({
        booking: groupBookings[0],
        groupBookings,
        displayDuration: lastEnd - firstStart,
      })
    } else {
      entries.push({
        booking,
        displayDuration: previewDurations[booking.id] ?? booking.duration,
      })
    }
  }

  return entries
}

const snapMinutes = (minutes: number) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES

export default function CalendarPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewType, setViewType] = useState<ViewType>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  )
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [selectedGroupBookings, setSelectedGroupBookings] = useState<any[] | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isTimeReservationDialogOpen, setIsTimeReservationDialogOpen] = useState(false)
  const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string; employeeId?: string } | null>(null)
  const [visibleEmployees, setVisibleEmployees] = useState<Set<string>>(new Set())
  const [isInitialized, setIsInitialized] = useState(false)
  const [previewDurations, setPreviewDurations] = useState<Record<string, number>>({})
  const [timeReservations, setTimeReservations] = useState<any[]>([])

  const { data: employees } = useEmployees()

  const dateRange = useMemo(() => {
    if (viewType === 'day') {
      const dateStr = formatDate(currentDate)
      return { startDate: dateStr, endDate: dateStr }
    }
    if (viewType === 'week') {
      const weekDays = generateWeekDays(currentDate)
      return { startDate: formatDate(weekDays[0]), endDate: formatDate(weekDays[6]) }
    }
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    return { startDate: formatDate(start), endDate: formatDate(end) }
  }, [viewType, currentDate])

  const { data: bookings, isLoading } = useBookings(dateRange)
  const updateScheduleMutation = useUpdateBookingSchedule()

  useEffect(() => {
    if (employees && !isInitialized) {
      if (employees.length > 0) setVisibleEmployees(new Set(employees.map(e => e.id)))
      setIsInitialized(true)
    }
  }, [employees, isInitialized])

  const bookingsById = useMemo(() => {
    const map: Record<string, any> = {}
    bookings?.forEach((b: any) => {
      map[b.id] = b
    })
    return map
  }, [bookings])

  const isWithinBusinessHours = (startMinutes: number, duration: number) => {
    const start = BUSINESS_HOURS.START * 60
    const end = BUSINESS_HOURS.END * 60
    return startMinutes >= start && startMinutes + duration <= end
  }

  const hasCollision = (employeeId: string, date: string, startMinutes: number, duration: number, bookingId: string) => {
    const dayBookings = bookings?.filter((b: any) => {
      if (b.id === bookingId) return false
      if (b.status === 'cancelled') return false
      return b.employee?.id === employeeId && b.booking_date === date
    }) || []

    return dayBookings.some((b: any) => {
      const otherStart = timeToMinutes(b.booking_time)
      const otherEnd = otherStart + Number(b.duration || 0)
      const nextEnd = startMinutes + duration
      return startMinutes < otherEnd && nextEnd > otherStart
    })
  }

  const moveBooking = async (bookingId: string, date: string, time: string, employeeId?: string) => {
    const booking = bookingsById[bookingId]
    if (!booking) return

    const nextEmployeeId = employeeId || booking.employee?.id
    const duration = previewDurations[booking.id] ?? booking.duration
    const startMinutes = timeToMinutes(time)

    if (!nextEmployeeId) {
      toast.error('Brak przypisanego pracownika dla wizyty')
      return
    }

    if (!isWithinBusinessHours(startMinutes, duration)) {
      toast.error('Termin wykracza poza godziny pracy')
      return
    }

    if (hasCollision(nextEmployeeId, date, startMinutes, duration, booking.id)) {
      toast.error('Wybrany termin koliduje z inną wizytą')
      return
    }

    try {
      await updateScheduleMutation.mutateAsync({
        id: booking.id,
        bookingDate: date,
        bookingTime: time,
        employeeId: nextEmployeeId,
      })
      toast.success('Termin wizyty został zmieniony')
    } catch {
      // handled by mutation + API
    }
  }

  const resizeBooking = async (booking: any, duration: number) => {
    const safeDuration = Math.max(SLOT_MINUTES, snapMinutes(duration))
    const employeeId = booking.employee?.id
    const startMinutes = timeToMinutes(booking.booking_time)

    setPreviewDurations(prev => {
      const next = { ...prev }
      delete next[booking.id]
      return next
    })

    if (!employeeId) {
      toast.error('Brak przypisanego pracownika dla wizyty')
      return
    }

    if (!isWithinBusinessHours(startMinutes, safeDuration)) {
      toast.error('Termin wykracza poza godziny pracy')
      return
    }

    if (hasCollision(employeeId, booking.booking_date, startMinutes, safeDuration, booking.id)) {
      toast.error('Nowa długość koliduje z inną wizytą')
      return
    }

    try {
      await updateScheduleMutation.mutateAsync({ id: booking.id, duration: safeDuration })
      toast.success('Długość wizyty została zmieniona')
    } catch {
      // handled by mutation + API
    }
  }

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

  const handleToday = () => setCurrentDate(new Date())

  const handleAddBooking = () => {
    setSelectedBooking(null)
    setSelectedSlot(null)
    setIsDialogOpen(true)
  }

  const handleAddTimeReservation = () => setIsTimeReservationDialogOpen(true)
  const handleAddAbsence = () => setIsAbsenceDialogOpen(true)

  useEffect(() => {
    const action = searchParams.get('action')
    if (action !== 'new-booking') {
      return
    }

    handleAddBooking()
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('action')
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname
    router.replace(nextUrl, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    if (viewType !== 'day' && viewType !== 'week') {
      setTimeReservations([])
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams()

    if (viewType === 'day') {
      params.set('date', formatDate(currentDate))
    } else {
      const weekDays = generateWeekDays(currentDate)
      params.set('from', formatDate(weekDays[0]))
      params.set('to', formatDate(weekDays[6]))
    }

    const fetchTimeReservations = async () => {
      try {
        const response = await fetch(`/api/time-reservations?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          setTimeReservations([])
          return
        }
        const payload = await response.json() as { reservations?: any[] }
        setTimeReservations(Array.isArray(payload.reservations) ? payload.reservations : [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setTimeReservations([])
        }
      }
    }

    void fetchTimeReservations()
    return () => controller.abort()
  }, [currentDate, viewType, isTimeReservationDialogOpen])

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking)
    setSelectedSlot(null)
    if (booking.visit_group_id) {
      const siblings = bookings?.filter((b: any) => b.visit_group_id === booking.visit_group_id) || []
      setSelectedGroupBookings(siblings)
    } else {
      setSelectedGroupBookings(null)
    }
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
    if (newSet.has(employeeId)) newSet.delete(employeeId)
    else newSet.add(employeeId)
    setVisibleEmployees(newSet)
  }

  const getPeriodLabel = () => {
    if (viewType === 'day') return format(currentDate, 'd MMMM yyyy', { locale: pl })
    if (viewType === 'week') {
      const weekDays = generateWeekDays(currentDate)
      return `${format(weekDays[0], 'd MMM', { locale: pl })} - ${format(weekDays[6], 'd MMM yyyy', { locale: pl })}`
    }
    return format(currentDate, 'LLLL yyyy', { locale: pl })
  }

  const timeSlots = Array.from({ length: BUSINESS_HOURS.END - BUSINESS_HOURS.START }, (_, i) => BUSINESS_HOURS.START + i)

  const bookingsByEmployeeAndDate: Record<string, Record<string, any[]>> = {}
  employees?.forEach((emp) => {
    bookingsByEmployeeAndDate[emp.id] = {}
  })

  bookings?.forEach((booking: any) => {
    const empId = booking.employee?.id
    if (!empId) return
    const date = booking.booking_date
    if (!bookingsByEmployeeAndDate[empId]) bookingsByEmployeeAndDate[empId] = {}
    if (!bookingsByEmployeeAndDate[empId][date]) bookingsByEmployeeAndDate[empId][date] = []
    bookingsByEmployeeAndDate[empId][date].push(booking)
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Ładowanie...</div>
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Kalendarz</h1>
          <p className="text-muted-foreground text-base font-medium theme-header-subtitle">{getPeriodLabel()}</p>
        </div>

        <div className="w-full overflow-x-auto scrollbar-hide sm:w-auto">
          <div className="flex min-w-max items-center gap-2 p-1 glass rounded-xl">
            <Button variant={viewType === 'day' ? 'default' : 'ghost'} onClick={() => setViewType('day')} size="sm" className={`h-11 min-h-[44px] min-w-[44px] rounded-lg px-4 shrink-0 transition-all ${viewType === 'day' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>Dzień</Button>
            <Button variant={viewType === 'week' ? 'default' : 'ghost'} onClick={() => setViewType('week')} size="sm" className={`h-11 min-h-[44px] min-w-[44px] rounded-lg px-4 shrink-0 transition-all ${viewType === 'week' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>Tydzień</Button>
            <Button variant={viewType === 'month' ? 'default' : 'ghost'} onClick={() => setViewType('month')} size="sm" className={`h-11 min-h-[44px] min-w-[44px] rounded-lg px-4 shrink-0 transition-all ${viewType === 'month' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>Miesiąc</Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleToday} className="h-11 min-h-[44px] min-w-[44px] rounded-lg px-4">Dziś</Button>
        <Button variant="outline" size="icon" onClick={handlePrevPeriod} className="h-11 w-11 rounded-lg"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" onClick={handleNextPeriod} className="h-11 w-11 rounded-lg"><ChevronRight className="h-4 w-4" /></Button>
        <div className="flex-1" />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-lg lg:hidden">
              <Users className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[70vh]">
            <SheetHeader>
              <SheetTitle>Pracownicy</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 mt-4 overflow-y-auto pb-6">
              {employees?.map((emp, idx) => {
                const colors = getEmployeeColor(idx)
                const isVisible = visibleEmployees.has(emp.id)
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleEmployee(emp.id)}
                    className={`rounded-lg text-sm font-medium px-4 py-3 border transition-all text-left ${isVisible ? `${colors.bgAccent} text-white border-transparent shadow-sm` : 'bg-white border-gray-200 text-gray-700'}`}
                  >
                    {emp.first_name} {emp.last_name}
                  </button>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-11 min-h-[44px] min-w-[44px] rounded-lg shadow-lg px-4">
              <Plus className="mr-2 h-4 w-4" />
              Nowa wizyta
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleAddBooking}>Nowa wizyta</DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddTimeReservation}>Rezerwacja czasu</DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddAbsence}>Nieobecność</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-4 items-start">
        {viewType !== 'month' && (
          <div className="hidden lg:block w-[240px] flex-shrink-0 space-y-3">
            <MiniCalendar
              currentDate={currentDate}
              onDayClick={(date) => {
                setCurrentDate(date)
                setViewType('day')
              }}
            />
            <div className="theme-employee-filter glass p-3 rounded-xl flex flex-col gap-1.5">
              <span className="theme-employee-filter-label text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-1">Pracownicy</span>
              {employees?.map((emp, idx) => {
                const colors = getEmployeeColor(idx)
                const isVisible = visibleEmployees.has(emp.id)
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleEmployee(emp.id)}
                    className={`theme-employee-chip rounded-lg text-xs font-medium px-3 py-2 border transition-all text-left ${isVisible ? `${colors.bgAccent} text-white border-transparent shadow-sm` : 'hover:bg-gray-100 bg-white border-gray-200 text-gray-700'}`}
                  >
                    {emp.first_name} {emp.last_name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <Card className="theme-calendar-shell flex-1 overflow-hidden glass rounded-2xl min-w-0">
        {viewType === 'day' && (
          <DayView
            currentDate={currentDate}
            timeSlots={timeSlots}
            bookingsByEmployeeAndDate={bookingsByEmployeeAndDate}
            employees={employees}
            visibleEmployees={visibleEmployees}
            onTimeSlotClick={handleTimeSlotClick}
            onBookingClick={handleBookingClick}
            getEmployeeColor={getEmployeeColor}
            onMoveBooking={moveBooking}
            onResizeBooking={resizeBooking}
            previewDurations={previewDurations}
            setPreviewDurations={setPreviewDurations}
            timeReservations={timeReservations}
          />
        )}
        {viewType === 'week' && (
          <WeekView
            currentDate={currentDate}
            timeSlots={timeSlots}
            bookingsByEmployeeAndDate={bookingsByEmployeeAndDate}
            employees={employees}
            visibleEmployees={visibleEmployees}
            onTimeSlotClick={handleTimeSlotClick}
            onBookingClick={handleBookingClick}
            getEmployeeColor={getEmployeeColor}
            onMoveBooking={moveBooking}
            onResizeBooking={resizeBooking}
            previewDurations={previewDurations}
            setPreviewDurations={setPreviewDurations}
            timeReservations={timeReservations}
          />
        )}
        {viewType === 'month' && <MonthView currentDate={currentDate} bookings={bookings} onDayClick={handleDayClick} onBookingClick={handleBookingClick} employees={employees} getEmployeeColor={getEmployeeColor} />}
      </Card>
      </div>

      {isDialogOpen && (
        <BookingDialog
          isOpen={isDialogOpen}
          onClose={() => {
            setIsDialogOpen(false)
            setSelectedSlot(null)
          }}
          booking={selectedBooking}
          preloadedGroupBookings={selectedGroupBookings}
          prefilledSlot={selectedSlot}
        />
      )}
      <TimeReservationDialog
        isOpen={isTimeReservationDialogOpen}
        onClose={() => setIsTimeReservationDialogOpen(false)}
        prefilledSlot={selectedSlot}
      />
      <AbsenceDialog
        isOpen={isAbsenceDialogOpen}
        onClose={() => setIsAbsenceDialogOpen(false)}
        prefilledRange={dateRange}
      />
    </div>
  )
}

function DayView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick, getEmployeeColor, onMoveBooking, onResizeBooking, previewDurations, setPreviewDurations, timeReservations }: any) {
  const dateStr = formatDate(currentDate)
  const now = new Date()
  const isToday = isSameDay(currentDate, now)
  const currentHour = now.getHours()
  const visibleEmployeesList = employees?.filter((emp: any) => visibleEmployees.has(emp.id)) || []
  const columnCount = visibleEmployeesList.length
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const suppressClickUntilRef = useRef(0)
  const pxPerHour = 96

  const suppressClicks = (ms = 250) => {
    suppressClickUntilRef.current = Date.now() + ms
  }

  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current || isDragging || isResizing

  const startResize = (e: React.MouseEvent, booking: any) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    suppressClicks()
    console.debug('[Calendar][DayView] resize:start', { bookingId: booking.id })
    const startY = e.clientY
    const initialDuration = previewDurations[booking.id] ?? booking.duration
    let latestDuration = initialDuration

    const onMouseMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY
      const deltaMinutes = snapMinutes((deltaY / pxPerHour) * 60)
      const nextDuration = Math.max(SLOT_MINUTES, initialDuration + deltaMinutes)
      latestDuration = nextDuration
      setPreviewDurations((prev: Record<string, number>) => ({ ...prev, [booking.id]: nextDuration }))
    }

    const onMouseUp = async () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      suppressClicks()
      setIsResizing(false)
      console.debug('[Calendar][DayView] resize:end', { bookingId: booking.id, nextDuration: latestDuration })
      const nextDuration = latestDuration
      await onResizeBooking(booking, nextDuration)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="overflow-auto h-full">
      <div style={{ minWidth: `${Math.max(560, 80 + columnCount * 160)}px` }}>
      <div className="theme-calendar-day-header grid border-b bg-white sticky top-0 z-30" style={{ gridTemplateColumns: `80px repeat(${Math.max(1, columnCount)}, 1fr)` }}>
        <div className="theme-calendar-time-head border-r p-3 text-center flex items-center justify-center bg-gray-50/50"><p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Czas</p></div>
        {visibleEmployeesList.map((emp: any) => {
          const empIdx = employees.findIndex((e: any) => e.id === emp.id)
          const colors = getEmployeeColor(empIdx)
          return <div key={emp.id} className={`theme-calendar-employee-head p-3 border-r text-center overflow-hidden bg-gradient-to-b ${colors.gradient}`}><p className={`theme-calendar-employee-head-text font-bold truncate text-sm ${colors.text}`}>{emp.first_name} {emp.last_name}</p></div>
        })}
        {columnCount === 0 && <div className="p-3 text-center text-gray-500 text-sm">Brak wybranych pracowników</div>}
      </div>

        <div className="grid relative" style={{ gridTemplateColumns: `80px repeat(${Math.max(1, columnCount)}, 1fr)` }}>
          <div className="theme-calendar-time-column border-r bg-gray-50/80 sticky left-0 z-20">
            {timeSlots.map((hour: number) => <div key={hour} className="theme-calendar-time-slot h-24 border-b p-2 text-[11px] font-bold text-gray-500 text-center flex items-center justify-center sticky left-0 z-10 bg-background">{String(hour).padStart(2, '0')}:00</div>)}
          </div>

          {visibleEmployeesList.map((employee: any) => {
            const empIdx = employees.findIndex((e: any) => e.id === employee.id)
            const colors = getEmployeeColor(empIdx)
            return (
              <div key={employee.id} className={`theme-calendar-day-column relative border-r hover:${colors.bg}/30 transition-colors`}>
                {timeSlots.map((hour: number) => {
                  const dropTime = `${String(hour).padStart(2, '0')}:00`
                  return (
                    <div
                      key={hour}
                      className="theme-calendar-drop-slot h-24 border-b border-gray-200 cursor-pointer transition-colors group relative"
                      onClick={() => {
                        if (shouldSuppressClick()) {
                          console.debug('[Calendar][DayView] slot-click:suppressed', { dateStr, dropTime, employeeId: employee.id })
                          return
                        }
                        onTimeSlotClick(dateStr, dropTime, employee.id)
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault()
                        suppressClicks()
                        const bookingId = e.dataTransfer.getData('text/plain')
                        if (!bookingId) return
                        console.debug('[Calendar][DayView] drop', { bookingId, dateStr, dropTime, employeeId: employee.id })
                        await onMoveBooking(bookingId, dateStr, dropTime, employee.id)
                        setIsDragging(false)
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Badge className={`${colors.bgAccent} text-white text-[10px] shadow-sm`}>+ Dodaj / Upuść</Badge>
                      </div>
                    </div>
                  )
                })}

                {(timeReservations || [])
                  .filter((reservation: any) => {
                    if (reservation.employee_id !== employee.id) return false
                    const start = new Date(reservation.start_at)
                    return !Number.isNaN(start.getTime()) && formatDate(start) === dateStr
                  })
                  .map((reservation: any) => {
                    const start = new Date(reservation.start_at)
                    const end = new Date(reservation.end_at)
                    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
                    const startMinutes = start.getHours() * 60 + start.getMinutes() - BUSINESS_HOURS.START * 60
                    const duration = (end.getTime() - start.getTime()) / (1000 * 60)
                    if (duration <= 0) return null
                    const top = (startMinutes / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100
                    const height = (duration / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100
                    return (
                      <div
                        key={reservation.id}
                        className="absolute p-[1px] z-[8] cursor-default"
                        style={{ top: `${top}%`, height: `${height}%`, minHeight: '44px', left: '0%', width: '96%' }}
                        title={reservation.title || 'Zarezerwowane'}
                      >
                        <div className="h-full w-full rounded-md border border-slate-600/40 bg-slate-500 text-white px-2 py-1 text-xs font-medium shadow-sm overflow-hidden">
                          <div className="truncate">{reservation.title || 'Zarezerwowane'}</div>
                        </div>
                      </div>
                    )
                  })}

                {buildCalendarEntries(bookingsByEmployeeAndDate[employee.id]?.[dateStr] || [], previewDurations).map((entry, index, allEntries) => {
                  const booking = entry.booking
                  const timeStr = booking.booking_time
                  if (!timeStr) return null
                  const startMinutes = timeToMinutes(timeStr) - BUSINESS_HOURS.START * 60
                  const duration = entry.displayDuration

                  const overlappingBookings = allEntries.filter((otherEntry, idx) => {
                    const otherBooking = otherEntry.booking
                    if (idx === index || otherBooking.id === booking.id) return false
                    const otherDuration = otherEntry.displayDuration
                    const oStart = timeToMinutes(otherBooking.booking_time) - BUSINESS_HOURS.START * 60
                    const oEnd = oStart + otherDuration
                    return (startMinutes < oEnd && (startMinutes + duration) > oStart)
                  })

                  const previousOverlaps = allEntries.slice(0, index).filter((prevEntry: any) => {
                    const prevDuration = prevEntry.displayDuration
                    const pStart = timeToMinutes(prevEntry.booking.booking_time) - BUSINESS_HOURS.START * 60
                    const pEnd = pStart + prevDuration
                    return (startMinutes < pEnd && (startMinutes + duration) > pStart)
                  })

                  const top = (startMinutes / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100
                  const height = (duration / ((BUSINESS_HOURS.END - BUSINESS_HOURS.START) * 60)) * 100
                  const hasOverlap = overlappingBookings.length > 0
                  const width = hasOverlap ? 65 : 96
                  const offset = previousOverlaps.length * 30

                  return (
                    <div
                      key={booking.id}
                      draggable
                      className={`absolute transition-all p-[1px] group/card ${isDragging ? 'opacity-70' : 'cursor-pointer'} hover:!z-50 hover:scale-[1.02]`}
                      style={{ top: `${top}%`, height: `${height}%`, minHeight: '44px', left: `${offset}%`, width: `${width}%`, zIndex: 10 + previousOverlaps.length }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', booking.id)
                        suppressClicks()
                        console.debug('[Calendar][DayView] drag:start', { bookingId: booking.id })
                        setIsDragging(true)
                      }}
                      onDragEnd={() => {
                        suppressClicks()
                        console.debug('[Calendar][DayView] drag:end', { bookingId: booking.id })
                        setIsDragging(false)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (shouldSuppressClick()) {
                          console.debug('[Calendar][DayView] booking-click:suppressed', { bookingId: booking.id })
                          return
                        }
                        onBookingClick(booking)
                      }}
                    >
                      <BookingCard booking={booking} serviceCategory={booking.service.category} employeeColors={colors} groupBookings={entry.groupBookings} />
                      <div className="absolute left-1 right-1 bottom-0 h-2 cursor-ns-resize rounded-b bg-black/10 hover:bg-black/20" onMouseDown={(e) => startResize(e, booking)} />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {isToday && (
            <div className="absolute left-[80px] right-0 h-0.5 bg-red-500/80 z-40 pointer-events-none" style={{ top: `${((currentHour - BUSINESS_HOURS.START + now.getMinutes() / 60) / (BUSINESS_HOURS.END - BUSINESS_HOURS.START)) * 100}%` }}>
              <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500 shadow-md ring-2 ring-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekView({ currentDate, timeSlots, bookingsByEmployeeAndDate, employees, visibleEmployees, onTimeSlotClick, onBookingClick, getEmployeeColor, onMoveBooking, onResizeBooking, previewDurations, setPreviewDurations, timeReservations }: any) {
  const weekDays = generateWeekDays(currentDate)
  const now = new Date()
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const suppressClickUntilRef = useRef(0)
  const pxPerHour = 80

  const suppressClicks = (ms = 250) => {
    suppressClickUntilRef.current = Date.now() + ms
  }

  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current || isDragging || isResizing

  const startResize = (e: React.MouseEvent, booking: any) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    suppressClicks()
    console.debug('[Calendar][WeekView] resize:start', { bookingId: booking.id })
    const startY = e.clientY
    const initialDuration = previewDurations[booking.id] ?? booking.duration
    let latestDuration = initialDuration

    const onMouseMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY
      const deltaMinutes = snapMinutes((deltaY / pxPerHour) * 60)
      const nextDuration = Math.max(SLOT_MINUTES, initialDuration + deltaMinutes)
      latestDuration = nextDuration
      setPreviewDurations((prev: Record<string, number>) => ({ ...prev, [booking.id]: nextDuration }))
    }

    const onMouseUp = async () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      suppressClicks()
      setIsResizing(false)
      console.debug('[Calendar][WeekView] resize:end', { bookingId: booking.id, nextDuration: latestDuration })
      const nextDuration = latestDuration
      await onResizeBooking(booking, nextDuration)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="overflow-auto h-full">
      <div className="min-w-[700px]">
      <div className="theme-calendar-week-header grid grid-cols-8 border-b bg-slate-50/50 sticky top-0 z-30">
        <div className="theme-calendar-time-head border-r p-3 text-center"><p className="text-xs font-semibold text-gray-600">CZAS</p></div>
        {weekDays.map((day) => {
          const today = isSameDay(day, now)
          return (
            <div key={day.toISOString()} className={`theme-calendar-week-day border-r p-3 text-center ${today ? 'bg-primary/5' : ''}`}>
              <p className="theme-calendar-week-day-label text-xs font-semibold text-gray-600">{format(day, 'EEE').toUpperCase()}</p>
              <p className={`theme-calendar-week-day-number font-bold ${today ? 'text-primary' : 'text-gray-900'}`}>{format(day, 'd')}</p>
            </div>
          )
        })}
      </div>

        <div className="grid grid-cols-8 min-w-[700px]">
          <div className="theme-calendar-time-column border-r bg-gray-50">
            {timeSlots.map((hour: number) => <div key={hour} className="theme-calendar-time-slot h-20 border-b p-2 text-xs font-semibold text-gray-600 text-center sticky left-0 z-10 bg-background">{String(hour).padStart(2, '0')}:00</div>)}
          </div>

          {weekDays.map((day) => {
            const dateStr = formatDate(day)
            const today = isSameDay(day, now)
            return (
              <div key={dateStr} className={`theme-calendar-week-column relative border-r ${today ? 'bg-primary/5' : ''}`}>
                {timeSlots.map((hour: number) => {
                  const dropTime = `${String(hour).padStart(2, '0')}:00`
                  return (
                    <div
                      key={hour}
                      className="theme-calendar-drop-slot h-20 border-b border-gray-200 cursor-pointer hover:bg-slate-50 transition-colors group relative"
                      onClick={() => {
                        if (shouldSuppressClick()) {
                          console.debug('[Calendar][WeekView] slot-click:suppressed', { dateStr, dropTime })
                          return
                        }
                        onTimeSlotClick(dateStr, dropTime)
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault()
                        suppressClicks()
                        const bookingId = e.dataTransfer.getData('text/plain')
                        if (!bookingId) return
                        console.debug('[Calendar][WeekView] drop', { bookingId, dateStr, dropTime })
                        await onMoveBooking(bookingId, dateStr, dropTime)
                        setIsDragging(false)
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Badge className="bg-primary text-white text-xs">+</Badge>
                      </div>
                    </div>
                  )
                })}

                {employees?.map((employee: any) => {
                  if (!visibleEmployees.has(employee.id)) return null
                  const dayBookings = bookingsByEmployeeAndDate[employee.id]?.[dateStr] || []
                  const dayTimeReservations = (timeReservations || []).filter((reservation: any) => {
                    if (reservation.employee_id !== employee.id) return false
                    const start = new Date(reservation.start_at)
                    return !Number.isNaN(start.getTime()) && formatDate(start) === dateStr
                  })

                  return (
                    <div key={employee.id} className="contents">
                      {dayTimeReservations.map((reservation: any) => {
                        const start = new Date(reservation.start_at)
                        const end = new Date(reservation.end_at)
                        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
                        const startMinutes = start.getHours() * 60 + start.getMinutes() - BUSINESS_HOURS.START * 60
                        const duration = (end.getTime() - start.getTime()) / (1000 * 60)
                        if (duration <= 0) return null
                        const top = (startMinutes / 60) * 80
                        const height = (duration / 60) * 80
                        return (
                          <div
                            key={reservation.id}
                            className="absolute p-[1px] z-[8] cursor-default"
                            style={{ top: `${top}px`, height: `${height}px`, minHeight: '44px', left: '0%', width: '96%' }}
                            title={reservation.title || 'Zarezerwowane'}
                          >
                            <div className="h-full w-full rounded-md border border-slate-600/40 bg-slate-500 text-white px-2 py-1 text-xs font-medium shadow-sm overflow-hidden">
                              <div className="truncate">{reservation.title || 'Zarezerwowane'}</div>
                            </div>
                          </div>
                        )
                      })}

                      {buildCalendarEntries(dayBookings, previewDurations).map((entry, index, allEntries) => {
                        const booking = entry.booking
                        const startMinutes = timeToMinutes(booking.booking_time) - BUSINESS_HOURS.START * 60
                        const duration = entry.displayDuration

                        const overlappingBookings = allEntries.filter((otherEntry: any, idx: number) => {
                          const otherBooking = otherEntry.booking
                          if (idx === index || otherBooking.id === booking.id) return false
                          const otherDuration = otherEntry.displayDuration
                          const oStart = timeToMinutes(otherBooking.booking_time) - BUSINESS_HOURS.START * 60
                          const oEnd = oStart + otherDuration
                          return (startMinutes < oEnd && (startMinutes + duration) > oStart)
                        })

                        const previousOverlaps = allEntries.slice(0, index).filter((prevEntry: any) => {
                          const prevDuration = prevEntry.displayDuration
                          const pStart = timeToMinutes(prevEntry.booking.booking_time) - BUSINESS_HOURS.START * 60
                          const pEnd = pStart + prevDuration
                          return (startMinutes < pEnd && (startMinutes + duration) > pStart)
                        })

                        const top = (startMinutes / 60) * 80
                        const height = (duration / 60) * 80
                        const hasOverlap = overlappingBookings.length > 0
                        const width = hasOverlap ? 65 : 96
                        const offset = previousOverlaps.length * 30

                        return (
                          <div
                            key={booking.id}
                            draggable
                            className={`absolute transition-all hover:!z-50 hover:scale-[1.02] p-[1px] ${isDragging ? 'opacity-70' : 'cursor-pointer'}`}
                            style={{ top: `${top}px`, height: `${height}px`, minHeight: '44px', left: `${offset}%`, width: `${width}%`, zIndex: 10 + previousOverlaps.length }}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', booking.id)
                              suppressClicks()
                              console.debug('[Calendar][WeekView] drag:start', { bookingId: booking.id })
                              setIsDragging(true)
                            }}
                            onDragEnd={() => {
                              suppressClicks()
                              console.debug('[Calendar][WeekView] drag:end', { bookingId: booking.id })
                              setIsDragging(false)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (shouldSuppressClick()) {
                                console.debug('[Calendar][WeekView] booking-click:suppressed', { bookingId: booking.id })
                                return
                              }
                              onBookingClick(booking)
                            }}
                          >
                            <BookingCard booking={booking} serviceCategory={booking.service.category} employeeColors={getEmployeeColor(employees.findIndex((ee: any) => ee.id === employee.id))} groupBookings={entry.groupBookings} />
                            <div className="absolute left-1 right-1 bottom-0 h-2 cursor-ns-resize rounded-b bg-black/10 hover:bg-black/20" onMouseDown={(e) => startResize(e, booking)} />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({ currentDate, bookings, onDayClick, onBookingClick, employees, getEmployeeColor }: any) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const now = new Date()

  const bookingsByDate: Record<string, any[]> = {}
  bookings?.forEach((booking: any) => {
    const date = booking.booking_date
    if (!bookingsByDate[date]) bookingsByDate[date] = []
    bookingsByDate[date].push(booking)
  })

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-2">
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map((day) => <div key={day} className="theme-calendar-month-label text-center font-bold text-gray-600 py-2">{day}</div>)}
        {days.map((day) => {
          const dateStr = formatDate(day)
          const dayBookings = bookingsByDate[dateStr] || []
          const isToday = isSameDay(day, now)
          const isSelected = isSameDay(day, currentDate)
          const isCurrentMonth = isSameMonth(day, currentDate)
          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(day)}
              className={`theme-calendar-month-day min-h-24 p-2 rounded-lg cursor-pointer transition-all group ${
                isSelected 
                  ? 'bg-primary text-primary-foreground shadow-lg scale-[1.02] z-10' 
                  : isToday 
                    ? 'border-2 border-primary/30 glass' 
                    : isCurrentMonth 
                      ? 'glass hover:shadow-lg' 
                      : 'bg-gray-50 text-gray-400'
              }`}
            >
              <p className={`font-bold text-sm mb-1 ${isSelected ? 'text-white' : isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</p>
              <div className="relative mt-1">
                {dayBookings.slice(0, 4).map((booking: any, idx: number) => {
                  const empIdx = employees.findIndex((e: any) => e.id === booking.employee?.id)
                  const colors = getEmployeeColor(empIdx !== -1 ? empIdx : 0)
                  return (
                    <div
                      key={booking.id}
                      className={`theme-calendar-month-booking text-[10px] px-1.5 py-0.5 rounded shadow-sm border-l-2 truncate transition-transform hover:scale-105 hover:z-30 mb-0.5 ${isSelected ? 'bg-white/30 border-white text-white' : `${colors.bg} ${colors.border} ${colors.text}`}`}
                      style={{ marginLeft: `${idx * 4}px`, width: `calc(100% - ${idx * 4}px)` }}
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
                {dayBookings.length > 4 && <p className={`text-[10px] font-bold mt-1 text-center ${isSelected ? 'text-white/90' : 'text-primary'}`}>+ {dayBookings.length - 4} więcej</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
