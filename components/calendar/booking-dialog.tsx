'use client'

import { useEffect, useState } from 'react'
import { format, addMinutes } from 'date-fns'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useCreateBooking, useUpdateBooking } from '@/hooks/use-bookings'
import { createClient } from '@/lib/supabase/client'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useClients } from '@/hooks/use-clients'
import { BOOKING_STATUS_LABELS } from '@/lib/constants'
import { formatPhoneNumber, parsePhoneNumber, formatPrice, formatDateTime } from '@/lib/formatters'
import { toast } from 'sonner'
import { Clock, AlertCircle, Loader2, ChevronRight, ChevronLeft, Search, CheckCircle2, User, XCircle, UserX, CreditCard, Banknote } from 'lucide-react'
import Image from 'next/image'
import { useRouter, useParams } from "next/navigation"
import { PaymentStatusBadge } from '@/components/bookings/payment-status-badge'

const bookingFormSchema = z.object({
  employeeId: z.string().min(1, 'Wybierz pracownika'),
  serviceId: z.string().min(1, 'Wybierz usługę'),
  clientName: z.string().min(2, 'Minimum 2 znaki'),
  clientPhone: z.string().regex(/^[\d\s\-\+()]{9,}$/, 'Telefon musi mieć min. 9 cyfr'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: YYYY-MM-DD'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Godzina: HH:mm'),
  notes: z.string().optional(),
})

type BookingFormData = z.infer<typeof bookingFormSchema>
type OnlinePaymentStatus = 'none' | 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

type OnlinePaymentData = {
  status: OnlinePaymentStatus
  amount?: number
  paymentUrl?: string
}

interface BookingDialogProps {
  isOpen: boolean
  onClose: () => void
  booking?: any
  prefilledSlot?: { date: string; time: string; employeeId?: string } | null
}

export function BookingDialog({ isOpen, onClose, booking, prefilledSlot }: BookingDialogProps) {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const { data: employees } = useEmployees()
  const { data: services } = useServices()
  const { data: clients } = useClients()
  const [filteredEmployees, setFilteredEmployees] = useState<NonNullable<typeof employees>>([])
  const [isFilteredEmployeesLoading, setIsFilteredEmployeesLoading] = useState(false)
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([])
  const [surcharge, setSurcharge] = useState<number>(booking?.surcharge || 0)
  const [addonsTotal, setAddonsTotal] = useState(0)
  const [editableDuration, setEditableDuration] = useState<number>(booking?.duration || 60)
  const [savedDuration, setSavedDuration] = useState<number>(booking?.duration || 60)
  const [processingPayment, setProcessingPayment] = useState<'cash' | 'card' | 'voucher' | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('')
  const [pickerView, setPickerView] = useState<'category' | 'subcategory' | 'service'>('category')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showVoucherPanel, setShowVoucherPanel] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherData, setVoucherData] = useState<{ id: string; code: string; current_balance: number } | null>(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [clientVouchers, setClientVouchers] = useState<Array<{ id: string; code: string; current_balance: number }>>([])
  const [onlinePayment, setOnlinePayment] = useState<OnlinePaymentData>({ status: 'none' })
  const [isOnlinePaymentLoading, setIsOnlinePaymentLoading] = useState(false)

  const createMutation = useCreateBooking()
  const updateMutation = useUpdateBooking(booking?.id || '')

  useEffect(() => {
    setSurcharge(booking?.surcharge || 0)
    setEditableDuration(booking?.duration || 60)
    setSavedDuration(booking?.duration || 60)
  }, [booking?.id, booking?.surcharge, booking?.duration])

  useEffect(() => {
    if (!booking?.id) {
      setAddonsTotal(0)
      return
    }
    const supabase = createClient()
    supabase
      .from('booking_addons')
      .select('price_at_booking')
      .eq('booking_id', booking.id)
      .then(({ data }) => {
        const sum = (data || []).reduce((acc: number, row: { price_at_booking: number | null }) => acc + (row.price_at_booking || 0), 0)
        setAddonsTotal(sum)
      })
  }, [booking?.id])

  useEffect(() => {
    if (!showVoucherPanel || !booking?.client_id) return

    const fetchClientVouchers = async () => {
      try {
        const response = await fetch(`/api/vouchers?clientId=${booking.client_id}&status=active&salonId=${params.slug}`)
        if (!response.ok) return

        const result = await response.json()
        setClientVouchers(Array.isArray(result) ? result : [])
      } catch (error) {
        setClientVouchers([])
      }
    }

    fetchClientVouchers()
  }, [showVoucherPanel, booking?.client_id, params.slug])

  useEffect(() => {
    if (!isOpen || !booking?.id) {
      setOnlinePayment({ status: 'none' })
      setIsOnlinePaymentLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchOnlinePaymentStatus = async () => {
      setIsOnlinePaymentLoading(true)
      try {
        const response = await fetch(`/api/payments/booking/${booking.id}/status`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch online payment status')
        }

        const result = (await response.json()) as {
          status?: OnlinePaymentStatus
          amount?: number
          paymentUrl?: string
        }
        const allowed: OnlinePaymentStatus[] = ['none', 'pending', 'paid', 'failed', 'refunded', 'cancelled']
        const resolvedStatus = allowed.includes(result.status ?? 'none') ? (result.status ?? 'none') : 'none'
        setOnlinePayment({
          status: resolvedStatus,
          amount: typeof result.amount === 'number' ? result.amount : undefined,
          paymentUrl: typeof result.paymentUrl === 'string' ? result.paymentUrl : undefined,
        })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setOnlinePayment({ status: 'none' })
        }
      } finally {
        setIsOnlinePaymentLoading(false)
      }
    }

    fetchOnlinePaymentStatus()

    return () => {
      controller.abort()
    }
  }, [booking?.id, isOpen])

  // Oblicz defaultValues na podstawie props
  const getDefaultValues = (): BookingFormData => {
    if (booking) {
      return {
        employeeId: booking.employee.id,
        serviceId: booking.service.id,
        clientName: booking.client?.full_name || '',
        clientPhone: booking.client?.phone || '',
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        notes: booking.notes || '',
      }
    } else if (prefilledSlot) {
      return {
        employeeId: prefilledSlot.employeeId || employees?.[0]?.id || '',
        serviceId: '',
        clientName: '',
        clientPhone: '',
        bookingDate: prefilledSlot.date,
        bookingTime: prefilledSlot.time,
        notes: '',
      }
    } else {
      return {
        employeeId: employees?.[0]?.id || '',
        serviceId: '',
        clientName: '',
        clientPhone: '',
        bookingDate: new Date().toISOString().split('T')[0],
        bookingTime: '10:00',
        notes: '',
      }
    }
  }

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: getDefaultValues(),
    mode: 'onChange'
  })

  // Bug #7 fix: set employeeId from first employee once they load (only for new bookings)
  useEffect(() => {
    if (!booking && employees && employees.length > 0) {
      const currentValue = form.getValues('employeeId')
      if (!currentValue) {
        form.setValue('employeeId', employees[0].id, { shouldValidate: true })
      }
    }
  }, [booking, employees, form])

  // Client autocomplete
  const clientNameValue = form.watch('clientName')
  useEffect(() => {
    if (clientNameValue && clientNameValue.length > 1) {
      const filtered = clients?.filter(c =>
        c.full_name.toLowerCase().includes(clientNameValue.toLowerCase())
      ) || []
      setClientSuggestions(filtered.slice(0, 5))
    } else {
      setClientSuggestions([])
    }
  }, [clientNameValue, clients])

  // Pre-fill category/subcategory for existing booking or when service changes
  const serviceId = form.watch('serviceId')
  const displayedEmployees = serviceId ? filteredEmployees : (employees || [])

  useEffect(() => {
    if (booking) return

    if (!serviceId) {
      setFilteredEmployees(employees || [])
      setIsFilteredEmployeesLoading(false)
      return
    }

    const controller = new AbortController()

    const fetchEmployeesByService = async () => {
      setIsFilteredEmployeesLoading(true)
      try {
        const response = await fetch(`/api/employees?serviceId=${encodeURIComponent(serviceId)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Failed to fetch employees by service')

        const result = await response.json()
        const nextEmployees: NonNullable<typeof employees> = Array.isArray(result?.employees) ? result.employees : []
        setFilteredEmployees(nextEmployees)

        const selectedEmployeeId = form.getValues('employeeId')
        if (selectedEmployeeId && !nextEmployees.some((emp) => emp.id === selectedEmployeeId)) {
          form.setValue('employeeId', '', { shouldValidate: true })
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setFilteredEmployees([])
        }
      } finally {
        setIsFilteredEmployeesLoading(false)
      }
    }

    fetchEmployeesByService()

    return () => {
      controller.abort()
    }
  }, [booking, serviceId, employees, form])

  useEffect(() => {
    if (serviceId && services) {
      for (const cat of services) {
        for (const sub of cat.subcategories) {
          if (sub.services.find(s => s.id === serviceId)) {
            setSelectedCategory(cat.category)
            setSelectedSubcategory(sub.name)
            return
          }
        }
      }
    }
  }, [serviceId, services])

  const selectedService = services
    ?.flatMap((cat) => cat.subcategories)
    .flatMap((sub) => sub.services)
    .find((svc) => svc.id === serviceId)

  const handleSelectClient = (client: any) => {
    form.setValue('clientName', client.full_name, { shouldValidate: true })
    form.setValue('clientPhone', client.phone, { shouldValidate: true })
    // Bug #6 fix: explicitly clear suggestions so dropdown disappears before submit
    setClientSuggestions([])
  }

  const handleSubmit = async (data: BookingFormData) => {
    try {
      if (booking) {
        await updateMutation.mutateAsync({
          notes: data.notes,
        })
        toast.success('Wizyta zaktualizowana')
      } else {
        await createMutation.mutateAsync({
          ...data,
          clientPhone: parsePhoneNumber(data.clientPhone),
          duration: selectedService?.duration || 60,
          source: 'manual',
        })
        toast.success('Wizyta dodana')
      }
      onClose()
    } catch (error) {
      toast.error('Błąd podczas zapisywania wizyty')
    }
  }

  const handleCompleteBooking = async (paymentMethod: 'cash' | 'card' | 'voucher') => {
    try {
      setProcessingPayment(paymentMethod)
      await updateMutation.mutateAsync({
        status: 'completed',
        paymentMethod,
        surcharge: surcharge || 0,
      })
      toast.success('Wizyta zakończona')
      onClose()
    } catch (error) {
      toast.error('Błąd podczas kończenia wizyty')
    } finally {
      setProcessingPayment(null)
    }
  }

  const handleNoShow = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'no_show' })
      toast.success('Oznaczono jako nieobecność')
      onClose()
    } catch (error) {
      toast.error('Błąd podczas oznaczania nieobecności')
    }
  }

  const handleCancelBooking = async () => {
    try {
      await updateMutation.mutateAsync({ status: 'cancelled' })
      toast.success('Wizyta anulowana')
      onClose()
    } catch (error) {
      toast.error('Błąd podczas anulowania wizyty')
    }
  }

  const handleUpdateDuration = async () => {
    if (!booking) return

    const duration = Math.round(Number(editableDuration))
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error('Podaj poprawną długość wizyty (w minutach)')
      return
    }

    try {
      await updateMutation.mutateAsync({ duration })
      setEditableDuration(duration)
      setSavedDuration(duration)
      toast.success('Długość wizyty zaktualizowana')
    } catch (error) {
      toast.error('Błąd podczas aktualizacji długości wizyty')
    }
  }

  const currentBookingDuration = booking
    ? (Number.isFinite(Number(editableDuration)) && Number(editableDuration) > 0
      ? Math.round(Number(editableDuration))
      : booking.duration)
    : 60

  const handleValidateVoucher = async () => {
    const normalizedCode = voucherCode.trim().toUpperCase()
    if (!normalizedCode) {
      toast.error('Podaj kod vouchera')
      return
    }

    setVoucherLoading(true)
    try {
      const response = await fetch(`/api/vouchers?code=${normalizedCode}&salonId=${params.slug}`)
      if (!response.ok) {
        toast.error('Nie udało się sprawdzić vouchera')
        setVoucherData(null)
        return
      }

      const result = await response.json()
      const validated = Array.isArray(result) ? result[0] : null
      if (!validated) {
        toast.error('Voucher nie został znaleziony')
        setVoucherData(null)
        return
      }

      setVoucherCode(normalizedCode)
      setVoucherData(validated)
    } catch (error) {
      toast.error('Nie udało się sprawdzić vouchera')
      setVoucherData(null)
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleCompleteWithVoucher = async () => {
    if (!voucherData || !booking?.id) {
      toast.error('Najpierw zweryfikuj voucher')
      return
    }

    try {
      setVoucherLoading(true)
      const response = await fetch(`/api/vouchers/${voucherData.id}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          amount: booking.base_price + addonsTotal + (surcharge || 0),
        }),
      })

      if (!response.ok) {
        toast.error('Nie udało się rozliczyć vouchera')
        return
      }

      await handleCompleteBooking('voucher')
    } catch (error) {
      toast.error('Nie udało się rozliczyć vouchera')
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleCopyPaymentUrl = async () => {
    if (!onlinePayment.paymentUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(onlinePayment.paymentUrl)
      toast.success('Link do płatności skopiowany')
    } catch (error) {
      toast.error('Nie udało się skopiować linku')
    }
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl  rounded-2xl">
        <DialogHeader>
          <DialogTitle className="gradient-text">
            {booking ? 'Szczegóły wizyty' : 'Nowa wizyta'}
          </DialogTitle>
        </DialogHeader>

        {booking ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Klient</Label>
                <p className="font-bold text-gray-900">{booking.client?.full_name || 'Nieznany klient'}</p>
                <p className="text-sm text-gray-600">{booking.client?.phone ? formatPhoneNumber(booking.client.phone) : 'Brak telefonu'}</p>
              </div>

              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Data i czas</Label>
                <div className="flex flex-col">
                  <p className="font-bold text-gray-900">{formatDateTime(booking.booking_date, booking.booking_time)}</p>
                  <p className="text-xs text-gray-500 font-medium">
                    Koniec: {format(addMinutes(new Date(`${booking.booking_date}T${booking.booking_time}`), currentBookingDuration), 'HH:mm')}
                  </p>
                </div>
              </div>

              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Usługa</Label>
                <p className="font-bold text-gray-900">{booking.service.name}</p>
                <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                  <Clock className="h-3 w-3" />
                  {currentBookingDuration} min
                </div>
                {booking.status === 'scheduled' && (
                  <div className="mt-2 flex items-center justify-between bg-white/40 p-1.5 rounded-lg border border-purple-100">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="5"
                        step="5"
                        value={editableDuration}
                        onChange={(e) => setEditableDuration(parseInt(e.target.value, 10) || 0)}
                        className="h-7 w-16 text-center text-sm px-1 border-purple-200"
                      />
                      <span className="text-xs text-gray-500 font-medium">min</span>
                    </div>
                    {currentBookingDuration !== savedDuration && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleUpdateDuration}
                        disabled={updateMutation.isPending}
                        className="h-7 px-3 text-xs font-semibold text-purple-600 hover:text-purple-700 hover:bg-purple-100/50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Zapisz
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Pracownik</Label>
                <p className="font-bold text-gray-900">
                  {booking.employee.first_name} {booking.employee.last_name}
                </p>
              </div>

              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Status</Label>
                <Badge className="mt-1" variant={booking.status === 'completed' ? 'success' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                  {BOOKING_STATUS_LABELS[booking.status] || booking.status}
                </Badge>
              </div>

              <div className=" p-3 rounded-lg flex flex-col justify-between">
                <div>
                  <Label className="text-xs text-gray-600 uppercase font-semibold">Cena końcowa</Label>
                  <p className="font-bold text-purple-600 text-xl">{formatPrice(booking.base_price + addonsTotal + (surcharge || 0))}</p>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100/50">
                  <span className="text-xs text-gray-500 font-medium tracking-tight">
                    Baza: {formatPrice(booking.base_price)}
                    {addonsTotal > 0 && <span className="ml-1 text-purple-500">+ Dodatki: {formatPrice(addonsTotal)}</span>}
                  </span>
                  {booking.status === 'scheduled' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-medium">+ Dopłata:</span>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={surcharge || ''}
                          onChange={(e) => setSurcharge(parseFloat(e.target.value) || 0)}
                          className="h-7 w-16 text-xs pr-5 border-purple-200 bg-white/60 text-right"
                          placeholder="0"
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 font-medium">zł</span>
                      </div>
                    </div>
                  ) : (
                    booking.surcharge > 0 && (
                      <span className="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">+ {formatPrice(booking.surcharge)}</span>
                    )
                  )}
                </div>
              </div>
            </div>

            {booking.notes && (
              <div className=" p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Notatki</Label>
                <p className="text-sm text-gray-700 mt-1">{booking.notes}</p>
              </div>
            )}

            <div className=" p-3 rounded-lg space-y-3">
              <Label className="text-xs text-gray-600 uppercase font-semibold">Płatność online</Label>
              {isOnlinePaymentLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pobieranie statusu...
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <PaymentStatusBadge
                    status={onlinePayment.status}
                    amount={onlinePayment.status === 'paid' ? onlinePayment.amount : undefined}
                  />

                  {(onlinePayment.status === 'none' || onlinePayment.status === 'failed') && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/${params.slug}/bookings/${booking.id}/payment`}>Zainicjuj płatność</Link>
                    </Button>
                  )}

                  {onlinePayment.status === 'pending' && onlinePayment.paymentUrl && (
                    <Button type="button" size="sm" onClick={handleCopyPaymentUrl}>
                      Skopiuj link do płatności
                    </Button>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 pt-4 border-t border-purple-100/50 flex flex-col sm:flex-row gap-4 sm:justify-between items-center bg-gray-50/50 -mx-4 -mb-4 px-4 pb-4 rounded-b-2xl">
              {booking.status === 'scheduled' && (
                <>
                  <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto justify-start hide-scrollbar">
                    <Button
                      variant="outline"
                      onClick={handleNoShow}
                      disabled={updateMutation.isPending}
                      className="h-10 rounded-full border-orange-200 text-orange-600 bg-white hover:bg-orange-50 px-4 text-sm font-medium shrink-0"
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Nie przyszedł
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={updateMutation.isPending}
                      className="h-10 rounded-full border-red-200 text-red-600 bg-white hover:bg-red-50 px-4 text-sm font-medium shrink-0"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Anuluj wizytę
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    <Button
                      onClick={() => handleCompleteBooking('cash')}
                      disabled={updateMutation.isPending}
                      className="h-10 rounded-full px-5 bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-all border-0 shrink-0"
                    >
                      {processingPayment === 'cash' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Banknote className="h-4 w-4 mr-2" />
                      )}
                      Gotówka
                    </Button>
                    <Button
                      onClick={() => handleCompleteBooking('card')}
                      disabled={updateMutation.isPending}
                      className="h-10 rounded-full px-5 bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg transition-all border-0 shrink-0"
                    >
                      {processingPayment === 'card' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Karta
                    </Button>
                    <Button
                      type="button"
                      variant={showVoucherPanel ? 'default' : 'outline'}
                      onClick={() => {
                        setShowVoucherPanel((prev) => !prev)
                        if (showVoucherPanel) {
                          setVoucherData(null)
                          setVoucherCode('')
                        }
                      }}
                      disabled={updateMutation.isPending}
                      className="h-10 rounded-full px-4 shrink-0"
                    >
                      Voucher
                    </Button>
                  </div>
                </>
              )}
              {booking.status === "completed" && (
                <div className="flex items-center justify-end w-full">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/${params.slug}/clients/${booking.client_id}/treatment-records/new?bookingId=${booking.id}`)}
                    className="h-10 rounded-full px-4"
                  >
                    Utwórz kartę zabiegu
                  </Button>
                </div>
              )}
            </DialogFooter>
            {booking.status === 'scheduled' && showVoucherPanel && (
              <div className="mt-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    placeholder="Kod vouchera"
                    className="bg-white"
                  />
                  <Button
                    type="button"
                    onClick={handleValidateVoucher}
                    disabled={voucherLoading || !voucherCode.trim()}
                    className="shrink-0"
                  >
                    {voucherLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sprawdź
                  </Button>
                </div>

                {clientVouchers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {clientVouchers.map((voucher) => (
                      <Badge
                        key={voucher.id}
                        variant="outline"
                        onClick={() => {
                          setVoucherCode(voucher.code)
                          setVoucherData(voucher)
                        }}
                        className="cursor-pointer hover:bg-white"
                      >
                        {voucher.code} ({formatPrice(voucher.current_balance)})
                      </Badge>
                    ))}
                  </div>
                )}

                {voucherData && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-100 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="text-sm text-emerald-900">
                      Voucher {voucherData.code} • Saldo: {formatPrice(voucherData.current_balance)}
                    </div>
                    <Button
                      type="button"
                      onClick={handleCompleteWithVoucher}
                      disabled={voucherLoading || updateMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {(voucherLoading || processingPayment === 'voucher') ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Zatwierdź
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-semibold">Pracownik *</Label>
                <select
                  {...form.register('employeeId')}
                  disabled={isFilteredEmployeesLoading}
                  className="w-full  rounded-lg px-3 py-2"
                >
                  <option value="">Wybierz pracownika</option>
                  {isFilteredEmployeesLoading && (
                    <option value="" disabled>
                      Ładowanie pracowników...
                    </option>
                  )}
                  {displayedEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.employeeId && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.employeeId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2 col-span-full">
                <Label className="font-semibold">Usługa *</Label>
                <div className=" rounded-xl p-4 min-h-[200px] flex flex-col">
                  {selectedService && pickerView === 'category' && !searchTerm ? (
                    <div className="flex items-center justify-between bg-purple-50 p-4 rounded-lg border border-purple-100 animate-in fade-in zoom-in duration-200">
                      <div>
                        <p className="font-bold text-gray-900">{selectedService.name}</p>
                        <p className="text-sm text-gray-600">
                          {formatPrice(selectedService.price)} • {selectedService.duration} min
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCategory('')
                          setSelectedSubcategory('')
                          form.setValue('serviceId', '')
                          setPickerView('category')
                        }}
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-100 font-semibold"
                      >
                        Zmień
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1 flex flex-col">
                      <div className="flex items-center gap-2">
                        {pickerView !== 'category' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (pickerView === 'service') setPickerView('subcategory')
                              else setPickerView('category')
                            }}
                            className="p-1 h-8 w-8 rounded-full"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        )}
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                          <Input
                            placeholder="Szukaj usługi..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 pl-9 text-sm bg-white/50"
                          />
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[240px] pr-2 custom-scrollbar">
                        {searchTerm ? (
                          <div className="grid gap-2">
                            {services
                              ?.flatMap(cat => cat.subcategories.flatMap(sub => sub.services.map(s => ({ ...s, category: cat.category, subcategory: sub.name }))))
                              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                              .map(svc => (
                                <button
                                  key={svc.id}
                                  type="button"
                                  onClick={() => {
                                    form.setValue('serviceId', svc.id)
                                    setSearchTerm('')
                                    setPickerView('category')
                                  }}
                                  className="text-left p-3 rounded-lg hover:bg-purple-50 transition-colors border border-transparent hover:border-purple-100 group"
                                >
                                  <p className="font-medium text-gray-900 group-hover:text-purple-700">{svc.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {svc.category} › {svc.subcategory} • {formatPrice(svc.price)}
                                  </p>
                                </button>
                              ))}
                          </div>
                        ) : pickerView === 'category' ? (
                          <div className="grid grid-cols-2 gap-2">
                            {services?.map(cat => (
                              <button
                                key={cat.category}
                                type="button"
                                onClick={() => {
                                  setSelectedCategory(cat.category)
                                  setPickerView('subcategory')
                                }}
                                className="text-left p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-100 transition-all flex items-center justify-between group"
                              >
                                <span className="font-medium text-gray-700 group-hover:text-purple-700">{cat.category}</span>
                                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-400" />
                              </button>
                            ))}
                          </div>
                        ) : pickerView === 'subcategory' ? (
                          <div className="grid gap-2">
                            <p className="text-xs font-bold text-gray-400 uppercase px-1">{selectedCategory}</p>
                            {services?.find(c => c.category === selectedCategory)?.subcategories.map(sub => (
                              <button
                                key={sub.name}
                                type="button"
                                onClick={() => {
                                  setSelectedSubcategory(sub.name)
                                  setPickerView('service')
                                }}
                                className="text-left p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-100 transition-all flex items-center justify-between group"
                              >
                                <span className="font-medium text-gray-700 group-hover:text-purple-700">{sub.name}</span>
                                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-purple-400" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            <p className="text-xs font-bold text-gray-400 uppercase px-1">{selectedCategory} › {selectedSubcategory}</p>
                            {services
                              ?.find(c => c.category === selectedCategory)
                              ?.subcategories.find(s => s.name === selectedSubcategory)
                              ?.services.map(svc => (
                                <button
                                  key={svc.id}
                                  type="button"
                                  onClick={() => {
                                    form.setValue('serviceId', svc.id)
                                    setPickerView('category')
                                  }}
                                  className="text-left p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-100 transition-all group"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium text-gray-900 group-hover:text-purple-700">{svc.name}</p>
                                    <p className="text-sm font-bold text-purple-600">{formatPrice(svc.price)}</p>
                                  </div>
                                  <p className="text-xs text-gray-500">{svc.duration} min</p>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {form.formState.errors.serviceId && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.serviceId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2 relative">
                <Label className="font-semibold">Imię i nazwisko klienta *</Label>
                <Input
                  {...form.register('clientName')}
                  placeholder="Wpisz imię lub nazwisko"
                  className=" rounded-lg"
                  // Bug #6 fix: close dropdown when input loses focus (with delay for click)
                  onBlur={() => setTimeout(() => setClientSuggestions([]), 150)}
                />
                {form.formState.errors.clientName && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.clientName.message}
                  </p>
                )}
                {clientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1  rounded-lg overflow-hidden z-50">
                    {clientSuggestions.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={(e) => {
                          // Bug #6 fix: use onMouseDown (fires before onBlur) to select before blur closes dropdown
                          e.preventDefault()
                          handleSelectClient(client)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-purple-100 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{client.full_name}</p>
                        <p className="text-xs text-gray-600">{formatPhoneNumber(client.phone)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Telefon klienta *</Label>
                <Input
                  {...form.register('clientPhone')}
                  placeholder="+48 123 456 789"
                  className=" rounded-lg"
                />
                {form.formState.errors.clientPhone && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.clientPhone.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Data *</Label>
                <Input type="date" {...form.register('bookingDate')} className=" rounded-lg" />
                {form.formState.errors.bookingDate && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.bookingDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Godzina *</Label>
                <Input type="time" {...form.register('bookingTime')} className=" rounded-lg" />
                {form.watch('bookingTime') && selectedService && (
                  <p className="text-[10px] text-purple-600 font-bold mt-1">
                    Przewidywany koniec: {format(addMinutes(new Date(`2000-01-01T${form.watch('bookingTime')}`), selectedService.duration), 'HH:mm')}
                  </p>
                )}
                {form.formState.errors.bookingTime && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.bookingTime.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Notatki</Label>
              <Input {...form.register('notes')} placeholder="Dodatkowe informacje..." className=" rounded-lg" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} className="rounded-lg">
                Anuluj
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gradient-button rounded-lg">
                Zapisz wizytę
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anuluj wizytę</AlertDialogTitle>
          <AlertDialogDescription>
            Wizyta zostanie oznaczona jako anulowana. Pozostanie widoczna w historii.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Wróć</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancelBooking}
            className="bg-red-600 hover:bg-red-700"
          >
            Anuluj wizytę
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
