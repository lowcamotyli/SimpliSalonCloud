'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import {
  Search,
  Calendar as CalendarIcon,
  User,
  DollarSign,
  Clock,
  Filter,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  CalendarDays
} from 'lucide-react'
import { BookingDialog } from '@/components/calendar/booking-dialog'
import { formatPrice, formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

const STATUS_TABS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'scheduled', label: 'Zaplanowane' },
  { id: 'pending', label: 'Oczekujące' },
  { id: 'confirmed', label: 'Potwierdzone' },
  { id: 'completed', label: 'Zakończone' },
  { id: 'cancelled', label: 'Anulowane' },
]

const DATE_FILTERS = [
  { id: 'all', label: 'Całość' },
  { id: 'today', label: 'Dzisiaj' },
  { id: 'tomorrow', label: 'Jutro' },
  { id: 'week', label: 'Ten tydzień' },
]

export default function BookingsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: bookings, isLoading } = useBookings()
  const { data: employees } = useEmployees()

  const filteredBookings = useMemo(() => {
    if (!bookings) return []

    return bookings.filter((booking) => {
      const clientName = booking.client?.full_name?.toLowerCase() || ''
      const serviceName = booking.service?.name?.toLowerCase() || ''
      const employeeFirstName = booking.employee?.first_name?.toLowerCase() || ''
      const searchValue = search.toLowerCase()

      const matchesSearch =
        clientName.includes(searchValue) ||
        serviceName.includes(searchValue) ||
        employeeFirstName.includes(searchValue)

      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter

      const matchesEmployee = employeeFilter === 'all' || booking.employee?.id === employeeFilter

      let matchesDate = true
      if (dateFilter !== 'all') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const bookingDate = new Date(booking.booking_date)
        bookingDate.setHours(0, 0, 0, 0)

        if (dateFilter === 'today') {
          matchesDate = bookingDate.getTime() === today.getTime()
        } else if (dateFilter === 'tomorrow') {
          const tomorrow = new Date(today)
          tomorrow.setDate(today.getDate() + 1)
          matchesDate = bookingDate.getTime() === tomorrow.getTime()
        } else if (dateFilter === 'week') {
          const startOfWeek = new Date(today)
          startOfWeek.setDate(today.getDate() - today.getDay() + 1)
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 6)
          matchesDate = bookingDate >= startOfWeek && bookingDate <= endOfWeek
        }
      }

      return matchesSearch && matchesStatus && matchesEmployee && matchesDate
    })
  }, [bookings, search, statusFilter, employeeFilter, dateFilter])

  const statusColors = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    completed: 'bg-slate-50 text-slate-700 border-slate-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Rezerwacje</h1>
          <p className="mt-2 text-lg text-muted-foreground font-medium">Zarządzaj wizytami w swoim salonie</p>
        </div>
        <Button
          size="lg"
          className="gradient-button shadow-lg shadow-primary/20 h-12 px-6 rounded-xl font-bold"
          onClick={() => {
            setSelectedBooking(null)
            setIsDialogOpen(true)
          }}
        >
          + Nowa wizyta
        </Button>
      </div>

      <Card className="p-6 glass border-none shadow-xl shadow-slate-200/50 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center gap-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Szukaj klienta, usługi lub pracownika..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-12 bg-white/50 border-gray-200/50 focus:bg-white transition-all text-base rounded-xl"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-4 h-12 glass rounded-xl border border-gray-100/50">
              <CalendarDays className="h-5 w-5 text-gray-400" />
              <select
                className="bg-transparent text-sm font-semibold text-gray-700 outline-none"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                {DATE_FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 px-4 h-12 glass rounded-xl border border-gray-100/50">
              <User className="h-5 w-5 text-gray-400" />
              <select
                className="bg-transparent text-sm font-semibold text-gray-700 outline-none"
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <option value="all">Wszyscy pracownicy</option>
                {employees?.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                statusFilter === tab.id
                  ? "bg-primary text-white shadow-lg shadow-primary/20 translate-y-[-1px]"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 font-semibold"
              )}
            >
              {tab.label}
              {statusFilter === tab.id && (
                <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {filteredBookings.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="h-12 w-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Pobieranie rezerwacji...</p>
        </div>
      ) : filteredBookings.length > 0 ? (
        <motion.div
          className="grid gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filteredBookings.map((booking) => (
              <motion.div
                key={booking.id}
                layout
                variants={itemVariants}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card
                  className="group relative overflow-hidden p-5 hover:shadow-2xl hover:shadow-primary/10 transition-all border-none bg-white hover:border-l-4 hover:border-l-primary cursor-pointer"
                  onClick={() => {
                    setSelectedBooking(booking)
                    setIsDialogOpen(true)
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    {/* Time & Client Column */}
                    <div className="flex items-start gap-4 md:w-1/4">
                      <div className="flex flex-col items-center justify-center h-16 w-16 rounded-2xl bg-primary/5 border border-primary/10 shrink-0">
                        <span className="text-xs font-bold text-primary/60 uppercase">
                          {new Date(booking.booking_date).toLocaleDateString('pl-PL', { weekday: 'short' })}
                        </span>
                        <span className="text-lg font-black text-primary leading-none">
                          {booking.booking_time.slice(0, 5)}
                        </span>
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                          {booking.client?.full_name || 'Nieznany klient'}
                        </h3>
                        <p className="text-sm font-medium text-gray-500 truncate">
                          {booking.client?.phone || 'Brak telefonu'}
                        </p>
                      </div>
                    </div>

                    {/* Service Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-gray-700">
                          {booking.service?.name || 'Usunięta usługa'}
                        </span>
                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {booking.duration} min
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 overflow-hidden">
                          {booking.employee.avatar_url ? (
                            <Image src={booking.employee.avatar_url} alt="" width={32} height={32} />
                          ) : (
                            booking.employee?.first_name?.[0] || '?'
                          )}
                        </div>
                        <span className="text-sm font-semibold text-gray-600">
                          {booking.employee?.first_name || 'Nieznany'} {booking.employee?.last_name || 'pracownik'}
                        </span>
                      </div>
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between md:flex-col md:items-end gap-3 md:w-1/5 shrink-0 border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-6">
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Cena</p>
                        <p className="text-xl font-black text-slate-900">
                          {formatPrice(booking.total_price)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-bold border",
                          statusColors[booking.status as keyof typeof statusColors]
                        )}
                      >
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </Badge>
                    </div>

                    <div className="hidden md:flex items-center justify-center w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="mt-4 pt-3 border-t border-gray-50">
                      <p className="text-sm text-gray-500 italic flex items-start gap-2">
                        <span className="text-primary/60 font-bold block mt-1">“</span>
                        {booking.notes}
                        <span className="text-primary/60 font-bold block mt-auto">”</span>
                      </p>
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-20 px-6 text-center glass border-dashed border-2 border-gray-200">
          <div className="h-20 w-20 rounded-full bg-gray-50 flex items-center justify-center mb-6">
            <Search className="h-10 w-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {search || statusFilter !== 'all' || employeeFilter !== 'all' || dateFilter !== 'all'
              ? 'Nie znaleziono rezerwacji'
              : 'Brak rezerwacji'}
          </h3>
          <p className="text-gray-500 max-w-sm mb-8">
            {search || statusFilter !== 'all' || employeeFilter !== 'all' || dateFilter !== 'all'
              ? 'Spróbuj zmienić filtry lub wyczyść wyszukiwanie, aby zobaczyć inne wizyty.'
              : 'W Twoim salonie nie ma jeszcze żadnych rezerwacji. Dodaj pierwszą wizytę, aby zacząć!'}
          </p>
          {(search || statusFilter !== 'all' || employeeFilter !== 'all' || dateFilter !== 'all') && (
            <Button
              variant="outline"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setEmployeeFilter('all')
                setDateFilter('all')
              }}
              className="rounded-xl font-bold"
            >
              Wyczyść wszystkie filtry
            </Button>
          )}
        </Card>
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
