'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useParams } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useCreateBooking, useUpdateBooking } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { useClients } from '@/hooks/use-clients'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatPhoneNumber, parsePhoneNumber, formatPrice, formatDateTime } from '@/lib/formatters'
import { toast } from 'sonner'
import { Clock, DollarSign, AlertCircle } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Checkbox } from '@/components/ui/checkbox'

const bookingFormSchema = z.object({
  employeeId: z.string().min(1, 'Wybierz pracownika'),
  serviceId: z.string().min(1, 'Wybierz usługę'),
  clientName: z.string().min(2, 'Minimum 2 znaki'),
  clientPhone: z.string().regex(/^[\d\s\-\+()]*$/, 'Nieprawidłowy format telefonu'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: YYYY-MM-DD'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Godzina: HH:mm'),
  notes: z.string().optional(),
})

type BookingFormData = z.infer<typeof bookingFormSchema>

interface ServiceAddon {
  id: string
  name: string
  price_delta: number
  duration_delta: number
  is_active: boolean
}

interface BookingDialogProps {
  isOpen: boolean
  onClose: () => void
  booking?: any
  prefilledSlot?: { date: string; time: string; employeeId?: string } | null
}

export function BookingDialog({ isOpen, onClose, booking, prefilledSlot }: BookingDialogProps) {
  const params = useParams<{ slug: string | string[] }>()
  const salonId = Array.isArray(params?.slug) ? params.slug[0] : params?.slug
  const { data: employees } = useEmployees()
  const { data: servicesData } = useServices()
  const { data: clients } = useClients()
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([])
  const [surcharge, setSurcharge] = useState<number>(booking?.surcharge || 0)
  const [addons, setAddons] = useState<ServiceAddon[]>([])
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])
  const [showVoucherPanel, setShowVoucherPanel] = useState(false)
  const [voucherCode, setVoucherCode] = useState("")
  const [voucherData, setVoucherData] = useState<{ id: string; code: string; current_balance: number; status: string } | null>(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [clientVouchers, setClientVouchers] = useState<Array<{ id: string; code: string; current_balance: number }>>([])
  const [clientVouchersLoaded, setClientVouchersLoaded] = useState(false)

  const createMutation = useCreateBooking()
  const updateMutation = useUpdateBooking(booking?.id || '')

  // Oblicz defaultValues na podstawie props
  const getDefaultValues = (): BookingFormData => {
    console.log('[BookingDialog] Computing defaultValues. booking:', booking, 'prefilledSlot:', prefilledSlot)

    if (booking) {
      const defaults = {
        employeeId: booking.employee.id,
        serviceId: booking.service.id,
        clientName: booking.client.full_name,
        clientPhone: booking.client.phone,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        notes: booking.notes || '',
      }
      console.log('[BookingDialog] Using booking defaults:', defaults)
      return defaults
    } else if (prefilledSlot) {
      const defaults = {
        employeeId: prefilledSlot.employeeId || employees?.[0]?.id || '',
        serviceId: '',
        clientName: '',
        clientPhone: '',
        bookingDate: prefilledSlot.date,
        bookingTime: prefilledSlot.time,
        notes: '',
      }
      console.log('[BookingDialog] Using prefilledSlot defaults:', defaults)
      return defaults
    } else {
      const defaults = {
        employeeId: employees?.[0]?.id || '',
        serviceId: '',
        clientName: '',
        clientPhone: '',
        bookingDate: new Date().toISOString().split('T')[0],
        bookingTime: '10:00',
        notes: '',
      }
      console.log('[BookingDialog] Using empty defaults:', defaults)
      return defaults
    }
  }

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: getDefaultValues(),
  })

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

  useEffect(() => {
    if (!showVoucherPanel || !booking?.client_id || !salonId || clientVouchersLoaded) {
      return
    }

    let active = true
    const fetchClientVouchers = async () => {
      setVoucherLoading(true)
      try {
        const response = await fetch(
          `/api/vouchers?salonId=${encodeURIComponent(salonId)}&clientId=${encodeURIComponent(booking.client_id)}&status=active`
        )
        if (!response.ok) {
          throw new Error('Failed to fetch vouchers')
        }

        const data = await response.json()
        const vouchers = Array.isArray(data) ? data : []
        if (active) {
          setClientVouchers(
            vouchers.map((voucher: any) => ({
              id: voucher.id,
              code: voucher.code,
              current_balance: Number(voucher.current_balance) || 0,
            }))
          )
          setClientVouchersLoaded(true)
        }
      } catch (error) {
        if (active) {
          setClientVouchers([])
        }
      } finally {
        if (active) {
          setVoucherLoading(false)
        }
      }
    }

    fetchClientVouchers()

    return () => {
      active = false
    }
  }, [showVoucherPanel, booking?.client_id, salonId, clientVouchersLoaded])

  useEffect(() => {
    setShowVoucherPanel(false)
    setVoucherCode("")
    setVoucherData(null)
    setVoucherLoading(false)
    setClientVouchers([])
    setClientVouchersLoaded(false)
  }, [booking?.id, isOpen])

  const watchedServiceId = form.watch('serviceId')

  useEffect(() => {
    const fetchAddons = async () => {
      if (!watchedServiceId) {
        setAddons([])
        setSelectedAddonIds([])
        return
      }

      try {
        const response = await fetch(`/api/services/${watchedServiceId}/addons`)
        if (!response.ok) {
          throw new Error('Failed to fetch addons')
        }
        const data = await response.json()
        setAddons(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error fetching service addons:', error)
        setAddons([])
      } finally {
        setSelectedAddonIds([])
      }
    }

    fetchAddons()
  }, [watchedServiceId])

  const selectedService = servicesData
    ?.flatMap((cat) => cat.subcategories)
    .flatMap((sub) => sub.services)
    .find((svc) => svc.id === watchedServiceId)

  const handleSelectClient = (client: any) => {
    form.setValue('clientName', client.full_name)
    form.setValue('clientPhone', client.phone)
    setClientSuggestions([])
  }

  const handleSubmit = async (data: BookingFormData) => {
    try {
      if (booking) {
        await updateMutation.mutateAsync({
          notes: data.notes,
          addon_ids: selectedAddonIds,
        })
        toast.success('Wizyta zaktualizowana')
      } else {
        await createMutation.mutateAsync({
          ...data,
          clientPhone: parsePhoneNumber(data.clientPhone),
          duration: selectedService?.duration || 60,
          source: 'manual',
          addon_ids: selectedAddonIds,
        })
        toast.success('Wizyta dodana')
      }
      onClose()
    } catch (error) {
      toast.error('Błąd podczas zapisywania wizyty')
    }
  }

  const handleCompleteBooking = async (paymentMethod: string) => {
    try {
      await updateMutation.mutateAsync({
        status: 'completed',
        paymentMethod,
        surcharge: surcharge || 0,
      })
      onClose()
    } catch (error) {
      toast.error('Błąd podczas kończenia wizyty')
    }
  }

  const handleValidateVoucher = async () => {
    const normalizedCode = voucherCode.trim()
    if (!normalizedCode || !salonId) return

    setVoucherLoading(true)
    try {
      const response = await fetch(
        `/api/vouchers?salonId=${encodeURIComponent(salonId)}&code=${encodeURIComponent(normalizedCode)}`
      )
      if (!response.ok) {
        throw new Error('Failed to validate voucher')
      }
      const data = await response.json()
      const validatedVoucher = Array.isArray(data) ? data[0] : null

      if (!validatedVoucher) {
        setVoucherData(null)
        toast.error('Nie znaleziono vouchera')
        return
      }

      setVoucherData({
        id: validatedVoucher.id,
        code: validatedVoucher.code,
        current_balance: Number(validatedVoucher.current_balance) || 0,
        status: validatedVoucher.status || 'active',
      })
      setVoucherCode(validatedVoucher.code ?? normalizedCode)
    } catch (error) {
      setVoucherData(null)
      toast.error('Nie znaleziono vouchera')
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleCompleteWithVoucher = async () => {
    if (!voucherData || !booking?.id) {
      return
    }

    setVoucherLoading(true)
    try {
      const response = await fetch(`/api/vouchers/${voucherData.id}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          amount: booking.price ?? 0,
        }),
      })

      if (response.ok) {
        await handleCompleteBooking('voucher')
      } else {
        toast.error('Błąd przy potrąceniu vouchera')
      }
    } catch (error) {
      toast.error('Błąd przy potrąceniu vouchera')
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleNoShow = async () => {
    if (confirm('Oznaczyć wizytę jako "Nie przyszedł"? Naruszenie zostanie zapisane na koncie klienta.')) {
      try {
        await updateMutation.mutateAsync({ status: 'no_show' })
        onClose()
      } catch (error) {
        toast.error('Błąd podczas zapisywania nieobecności')
      }
    }
  }

  const handleCancelBooking = async () => {
    if (confirm('Czy na pewno chcesz anulować tę wizytę?')) {
      try {
        await updateMutation.mutateAsync({ status: 'cancelled' })
        onClose()
      } catch (error) {
        toast.error('Błąd podczas anulowania wizyty')
      }
    }
  }

  const handleDeleteBooking = async () => {
    if (confirm(
      'Czy na pewno chcesz USUNĄĆ tę wizytę?\n\n' +
      'Wizyta zostanie przeniesiona do archiwum i nie będzie widoczna w kalendarzu.\n' +
      'Administrator może ją przywrócić.\n\n' +
      'Jeśli chcesz tylko anulować wizytę (bez usuwania), użyj przycisku "Anuluj wizytę".'
    )) {
      try {
        const response = await fetch(`/api/bookings/${booking.id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete booking')
        }

        toast.success('Wizyta usunięta')
        onClose()
      } catch (error) {
        toast.error('Błąd podczas usuwania wizyty')
      }
    }
  }

  const serviceId = watchedServiceId
  const activeAddons = addons.filter((addon) => addon.is_active)
  const selectedAddons = activeAddons.filter((addon) => selectedAddonIds.includes(addon.id))
  const totalAddonPrice = selectedAddons.reduce((sum, addon) => sum + addon.price_delta, 0)
  const totalAddonDuration = selectedAddons.reduce((sum, addon) => sum + addon.duration_delta, 0)
  const totalPrice = (selectedService?.price || 0) + totalAddonPrice
  const totalDuration = (selectedService?.duration || 0) + totalAddonDuration
  const categorizedServices = servicesData?.filter(cat => cat.category && cat.subcategories.some(sub => sub.services.length > 0)) || [];
  const uncategorizedServicesRaw = servicesData?.filter(cat => !cat.category && cat.subcategories.some(sub => sub.services.length > 0)) || [];
  const uncategorizedServices = uncategorizedServicesRaw.flatMap(cat => cat.subcategories.flatMap(sub => sub.services));


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass rounded-2xl">
        <DialogHeader>
          <DialogTitle className="gradient-text">
            {booking ? 'Szczegóły wizyty' : 'Nowa wizyta'}
          </DialogTitle>
        </DialogHeader>

        {booking ? (
          // View mode
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Klient</Label>
                <p className="font-bold text-gray-900">{booking.client.full_name}</p>
                <p className="text-sm text-gray-600">{formatPhoneNumber(booking.client.phone)}</p>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Data i godzina</Label>
                <p className="font-bold text-gray-900">{formatDateTime(booking.booking_date, booking.booking_time)}</p>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Usługa</Label>
                <p className="font-bold text-gray-900">{booking.service.name}</p>
                <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                  <Clock className="h-3 w-3" />
                  {booking.duration} min
                </div>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Pracownik</Label>
                <p className="font-bold text-gray-900">
                  {booking.employee.first_name} {booking.employee.last_name}
                </p>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Status</Label>
                <Badge className="mt-1" variant={booking.status === 'completed' ? 'success' : booking.status === 'cancelled' || booking.status === 'no_show' ? 'destructive' : 'secondary'}>
                  {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                </Badge>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Cena końcowa</Label>
                <p className="font-bold text-purple-600 text-lg">{formatPrice(booking.base_price + surcharge)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-600">Baza: {formatPrice(booking.base_price)}</span>
                  {booking.status === 'scheduled' ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-600">+ Dopłata:</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={surcharge}
                        onChange={(e) => setSurcharge(parseFloat(e.target.value) || 0)}
                        className="h-6 w-20 text-xs px-1"
                      />
                    </div>
                  ) : (
                    booking.surcharge > 0 && (
                      <span className="text-xs text-gray-600">+ Dopłata: {formatPrice(booking.surcharge)}</span>
                    )
                  )}
                </div>
              </div>
            </div>

            {booking.notes && (
              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Notatki</Label>
                <p className="text-sm text-gray-700 mt-1">{booking.notes}</p>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              {(booking.status === 'scheduled' || booking.status === 'confirmed') && (
                <>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={handleDeleteBooking}
                      className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Usuń wizytę
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleNoShow}
                      className="rounded-lg border-orange-300 text-orange-600 hover:bg-orange-50"
                    >
                      Nie przyszedł
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelBooking}
                      className="rounded-lg"
                    >
                      Anuluj wizytę
                    </Button>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      onClick={() => handleCompleteBooking('cash')}
                      className="gradient-button rounded-lg flex-1"
                    >
                      Gotówka
                    </Button>
                    <Button
                      onClick={() => handleCompleteBooking('card')}
                      className="gradient-button rounded-lg flex-1"
                    >
                      Karta
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowVoucherPanel(!showVoucherPanel)}
                      className="rounded-lg"
                    >
                      Voucher
                    </Button>
                  </div>
                  {showVoucherPanel && (
                    <div className="w-full space-y-3 glass p-3 rounded-lg">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={voucherCode}
                          onChange={(e) => setVoucherCode(e.target.value)}
                          placeholder="Kod vouchera"
                          className="glass rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleValidateVoucher}
                          disabled={voucherLoading || !voucherCode.trim()}
                          className="rounded-lg"
                        >
                          Sprawdz
                        </Button>
                      </div>

                      {clientVouchers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {clientVouchers.map((voucher) => (
                            <Badge
                              key={voucher.id}
                              className="cursor-pointer rounded-lg px-3 py-1"
                              variant={voucherData?.id === voucher.id ? 'default' : 'secondary'}
                              onClick={() => {
                                setVoucherCode(voucher.code)
                                setVoucherData({
                                  id: voucher.id,
                                  code: voucher.code,
                                  current_balance: voucher.current_balance,
                                  status: 'active',
                                })
                              }}
                            >
                              {voucher.code} ({formatPrice(voucher.current_balance)})
                            </Badge>
                          ))}
                        </div>
                      )}

                      {voucherData && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                          <p className="text-sm text-green-800 font-semibold">Voucher: {voucherData.code}</p>
                          <p className="text-sm text-green-700">
                            Saldo: {formatPrice(voucherData.current_balance)}
                          </p>
                          <Button
                            type="button"
                            onClick={handleCompleteWithVoucher}
                            disabled={voucherLoading}
                            className="rounded-lg bg-green-600 hover:bg-green-700 text-white"
                          >
                            Zatwierdz
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </DialogFooter>
          </div>
        ) : (
          // Create mode
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="font-semibold">Pracownik *</Label>
                <select
                  {...form.register('employeeId')}
                  className="w-full glass rounded-lg px-3 py-2"
                >
                  <option value="">Wybierz pracownika</option>
                  {employees?.map((emp) => (
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

              <div className="space-y-2">
                <Label className="font-semibold">Usługa *</Label>
                <input type="hidden" {...form.register('serviceId')} />
                <Accordion type="single" className="w-full" defaultValue={categorizedServices[0]?.category}>
                  {categorizedServices.map((cat) => (
                    <AccordionItem value={cat.category} key={cat.category}>
                      <AccordionTrigger>{cat.category}</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {cat.subcategories.filter(sub => sub.services.length > 0).map((sub, index) => (
                            <div key={`${cat.category}-${sub.name}-${index}`}>
                              <p className="mb-2 text-sm font-medium text-muted-foreground">{sub.name}</p>
                              <div className="grid grid-cols-1 gap-2">
                                {sub.services.map((svc) => (
                                  <button
                                    type="button"
                                    key={svc.id}
                                    onClick={() => form.setValue('serviceId', svc.id, { shouldValidate: true, shouldDirty: true })}
                                    className={`w-full text-left p-2 border rounded-md text-sm transition-colors flex justify-between items-center ${
                                      serviceId === svc.id
                                        ? "bg-primary/10 border-primary"
                                        : "hover:bg-muted/50"
                                    }`}
                                  >
                                    <span>{svc.name}</span>
                                    <span className="text-muted-foreground text-xs whitespace-nowrap pl-2">
                                      {formatPrice(svc.price)} / {svc.duration} min
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                  {uncategorizedServices.length > 0 && (
                    <AccordionItem value="other-services">
                      <AccordionTrigger>Inne</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-1 gap-2">
                            {uncategorizedServices.map(svc => (
                                <button
                                    type="button"
                                    key={svc.id}
                                    onClick={() => form.setValue('serviceId', svc.id, { shouldValidate: true, shouldDirty: true })}
                                    className={`w-full text-left p-2 border rounded-md text-sm transition-colors flex justify-between items-center ${
                                        serviceId === svc.id
                                        ? "bg-primary/10 border-primary"
                                        : "hover:bg-muted/50"
                                    }`}
                                >
                                    <span>{svc.name}</span>
                                    <span className="text-muted-foreground text-xs whitespace-nowrap pl-2">
                                    {formatPrice(svc.price)} / {svc.duration} min
                                    </span>
                                </button>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
                {form.formState.errors.serviceId && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.serviceId.message}
                  </p>
                )}
                {selectedService && activeAddons.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="font-semibold">Dodatki</Label>
                    <div className="space-y-2">
                      {activeAddons.map((addon) => {
                        const isChecked = selectedAddonIds.includes(addon.id)
                        return (
                          <label key={addon.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                setSelectedAddonIds((prev) =>
                                  checked
                                    ? [...prev, addon.id]
                                    : prev.filter((id) => id !== addon.id)
                                )
                              }}
                            />
                            <span>
                              {addon.name} +{addon.duration_delta}min +{addon.price_delta} PLN
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="glass p-2 rounded-lg text-sm">
                      <p>
                        Cena łącznie: {formatPrice(selectedService.price)} + {formatPrice(totalAddonPrice)} ={' '}
                        <span className="font-semibold">{formatPrice(totalPrice)}</span>
                      </p>
                      <p>
                        Czas łącznie: {selectedService.duration} min + {totalAddonDuration} min ={' '}
                        <span className="font-semibold">{totalDuration} min</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 relative">
                <Label className="font-semibold">Imię i nazwisko klienta *</Label>
                <Input
                  {...form.register('clientName')}
                  placeholder="Wpisz imię lub nazwisko"
                  className="glass rounded-lg"
                />
                {clientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 glass rounded-lg overflow-hidden z-50">
                    {clientSuggestions.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className="w-full text-left px-3 py-2 hover:bg-purple-100 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{client.full_name}</p>
                        <p className="text-xs text-gray-600">{formatPhoneNumber(client.phone)}</p>
                      </button>
                    ))}
                  </div>
                )}
                {form.formState.errors.clientName && (
                  <p className="text-sm text-red-600">{form.formState.errors.clientName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Telefon klienta *</Label>
                <Input
                  {...form.register('clientPhone')}
                  placeholder="+48 123 456 789"
                  className="glass rounded-lg"
                />
                {form.formState.errors.clientPhone && (
                  <p className="text-sm text-red-600">{form.formState.errors.clientPhone.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Data *</Label>
                <Input type="date" {...form.register('bookingDate')} className="glass rounded-lg" />
                <p className="text-xs text-gray-500">[DEBUG] Wartość: {form.watch('bookingDate')}</p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Godzina *</Label>
                <Input type="time" {...form.register('bookingTime')} className="glass rounded-lg" />
                <p className="text-xs text-gray-500">[DEBUG] Wartość: {form.watch('bookingTime')}</p>
              </div>
            </div>

            {selectedService && (
              <div className="glass p-3 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Cena usługi</p>
                  <p className="font-bold text-purple-600">{formatPrice(selectedService.price)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Czas trwania</p>
                  <p className="font-bold text-gray-900">{selectedService.duration} min</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-semibold">Notatki</Label>
              <Input {...form.register('notes')} placeholder="Dodatkowe informacje..." className="glass rounded-lg" />
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
  )
}
