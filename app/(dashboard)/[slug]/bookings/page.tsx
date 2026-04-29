'use client'

import { useState, useMemo } from 'react'
import { useBookings } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ListLoadingState } from '@/components/ui/list-loading-state'
import { ObjectCell, ObjectLink, ObjectPill, ObjectTrigger } from '@/components/objects'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import {
  Search,
  Calendar as CalendarIcon,
  User,
  DollarSign,
  Clock,
  Filter,
  MoreVertical,
  CheckCircle2,
  XCircle,
  CalendarDays
} from 'lucide-react'
import { BookingDialog } from '@/app/(dashboard)/[slug]/calendar/booking-dialog'
import { formatPrice, formatDateTime } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'

const STATUS_TABS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'scheduled', label: 'Zaplanowane' },
  { id: 'pending', label: 'Oczekujące' },
  { id: 'confirmed', label: 'Potwierdzone' },
  { id: 'paid', label: 'Opłacone' },
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
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('today')
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
    }).sort((a, b) => {
      const dateTimeA = `${a.booking_date}T${a.booking_time}`
      const dateTimeB = `${b.booking_date}T${b.booking_time}`
      return dateTimeA.localeCompare(dateTimeB)
    })
  }, [bookings, search, statusFilter, employeeFilter, dateFilter])

  const statusColors = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    paid: 'bg-green-50 text-green-700 border-green-200',
    completed: 'bg-slate-50 text-slate-700 border-slate-200',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants: Variants = {
    hidden: { y: 10, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-4 pb-12 sm:px-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-normal text-[var(--v3-text-primary)] sm:text-4xl">Rezerwacje</h1>
          <p className="mt-2 text-lg text-muted-foreground font-medium theme-header-subtitle">Zarządzaj wizytami w swoim salonie</p>
        </div>
        <Button
          size="lg"
          className="h-11 rounded-[var(--v3-r-md)] px-5 font-ui font-semibold"
          onClick={() => {
            setSelectedBooking(null)
            setIsDialogOpen(true)
          }}
        >
          + Nowa wizyta
        </Button>
      </div>

      <Card className="space-y-5 rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-[var(--v3-surface)] p-5 shadow-[var(--v3-shadow-card)]">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Szukaj klienta, usługi lub pracownika..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-[var(--v3-r-md)] border-[var(--v3-border)] bg-white pl-12 font-ui text-sm transition-all focus:border-[var(--v3-secondary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 items-center gap-2 rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white px-4">
              <CalendarDays className="h-5 w-5 text-gray-400" />
              <select
                className="bg-transparent font-ui text-sm font-semibold text-[var(--v3-text-primary)] outline-none"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                {DATE_FILTERS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="flex h-11 items-center gap-2 rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white px-4">
              <User className="h-5 w-5 text-gray-400" />
              <select
                className="bg-transparent font-ui text-sm font-semibold text-[var(--v3-text-primary)] outline-none"
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

        <div className="flex flex-wrap gap-1 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "rounded-[var(--v3-r-pill)] px-4 py-2 font-ui text-sm font-semibold transition-all whitespace-nowrap",
                statusFilter === tab.id
                  ? "bg-[var(--v3-primary)] text-white shadow-[var(--v3-shadow-card)]"
                  : "text-[var(--v3-text-secondary)] hover:bg-[var(--v3-bg-alt)] hover:text-[var(--v3-text-primary)]"
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
        <ListLoadingState rows={6} className="lg:grid-cols-1" />
      ) : filteredBookings.length > 0 ? (
        <>
        <motion.div
          key={`${dateFilter}-${statusFilter}-${employeeFilter}-${search}`}
          className="hidden gap-4 md:grid"
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
                  className="group relative cursor-pointer overflow-hidden rounded-[var(--v3-r-md)] border border-l-4 border-[var(--v3-border)] border-l-[var(--v3-secondary)] bg-[var(--v3-surface)] p-5 shadow-[var(--v3-shadow-card)] transition-[border-color,box-shadow] hover:border-[var(--v3-border-strong)] hover:shadow-[var(--v3-shadow-card-hover)]"
                  onClick={() => {
                    router.push(`/${slug}/bookings/${booking.id}`)
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    {/* Time & Client Column */}
                    <div className="flex items-start gap-4 md:w-1/4">
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-[var(--v3-bg-alt)]">
                        <span className="font-ui text-xs font-semibold uppercase text-[var(--v3-text-secondary)]">
                          {new Date(booking.booking_date).toLocaleDateString('pl-PL', { weekday: 'short' })}
                        </span>
                        <span className="font-ui text-[15px] font-bold leading-none text-[var(--v3-text-primary)] tabular-nums">
                          {booking.booking_time.slice(0, 5)}
                        </span>
                      </div>
                      <div className="space-y-1 min-w-0">
                        <ObjectCell
                          type="client"
                          id={booking.client?.id ?? ''}
                          label={booking.client?.full_name || 'Nieznany klient'}
                          slug={slug}
                          meta={booking.client?.phone || 'Brak telefonu'}
                          showActions={false}
                          className="max-w-[160px]"
                        />
                      </div>
                    </div>

                    {/* Service Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <ObjectPill
                          type="service"
                          id={booking.service?.id ?? ''}
                          label={booking.service?.name || 'Usunięta usługa'}
                          slug={slug}
                          className="max-w-[160px]"
                        />
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
                        <ObjectLink
                          type="worker"
                          id={booking.employee?.id ?? ''}
                          label={`${booking.employee?.first_name || 'Nieznany'} ${booking.employee?.last_name || 'pracownik'}`}
                          slug={slug}
                          showDot
                          className="max-w-[160px] truncate"
                        />
                      </div>
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between md:flex-col md:items-end gap-3 md:w-1/5 shrink-0 border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-6">
                      <div className="text-right">
                        <p className="mb-1 font-ui text-xs font-semibold uppercase tracking-normal text-[var(--v3-text-secondary)]">Cena</p>
                        <p className="font-display text-[17px] font-bold text-[var(--v3-gold)] tabular-nums">
                          {formatPrice(booking.total_price)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-[var(--v3-r-pill)] border px-3 py-1 font-ui text-xs font-semibold",
                          statusColors[booking.status as keyof typeof statusColors]
                        )}
                      >
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </Badge>
                    </div>

                    <div className="hidden md:flex items-center justify-center opacity-100 transition-opacity">
                      <ObjectTrigger
                        type="booking"
                        id={booking.id}
                        label={booking.client?.full_name || 'Wizyta'}
                        slug={slug}
                        meta={booking.booking_date}
                      />
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
        <div className="grid gap-3 md:hidden">
          {filteredBookings.map((booking) => (
            <Card
              key={booking.id}
              className="cursor-pointer rounded-[var(--v3-r-md)] border border-[var(--v3-border)] bg-white p-4 shadow-[var(--v3-shadow-card)] transition-all hover:border-[var(--v3-border-strong)] hover:shadow-[var(--v3-shadow-card-hover)]"
              onClick={() => {
                router.push(`/${slug}/bookings/${booking.id}`)
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <ObjectCell
                    type="client"
                    id={booking.client?.id ?? ''}
                    label={booking.client?.full_name || 'Nieznany klient'}
                    slug={slug}
                    meta={booking.client?.phone || 'Brak telefonu'}
                    showActions={false}
                    className="max-w-[160px]"
                  />
                  <ObjectPill
                    type="service"
                    id={booking.service?.id ?? ''}
                    label={booking.service?.name || 'Usunięta usługa'}
                    slug={slug}
                    className="max-w-[160px]"
                  />
                  <p className="text-xs font-semibold text-gray-500">
                    {new Date(booking.booking_date).toLocaleDateString('pl-PL')} - {booking.booking_time.slice(0, 5)}
                  </p>
                  <ObjectLink
                    type="worker"
                    id={booking.employee?.id ?? ''}
                    label={`${booking.employee?.first_name || 'Nieznany'} ${booking.employee?.last_name || 'pracownik'}`}
                    slug={slug}
                    showDot
                    className="max-w-[160px] truncate"
                  />
                </div>
                <ObjectTrigger
                  type="booking"
                  id={booking.id}
                  label={booking.client?.full_name || 'Wizyta'}
                  slug={slug}
                  meta={booking.booking_date}
                />
              </div>
              <div className="mt-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold border",
                    statusColors[booking.status as keyof typeof statusColors]
                  )}
                >
                  {BOOKING_STATUS_LABELS[booking.status]}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
        </>
      ) : (
        <Card className="flex flex-col items-center justify-center rounded-[var(--v3-r-md)] border-2 border-dashed border-[var(--v3-border)] bg-[var(--v3-surface)] px-6 py-20 text-center">
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
