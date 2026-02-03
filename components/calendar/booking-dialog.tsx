'use client'

import { useEffect, useState } from 'react'
import { format, addMinutes } from 'date-fns'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { BOOKING_STATUS_LABELS } from '@/lib/constants'
import { formatPhoneNumber, parsePhoneNumber, formatPrice, formatDateTime } from '@/lib/formatters'
import { toast } from 'sonner'
import { Clock, AlertCircle, Loader2, ChevronRight, ChevronLeft, Search, CheckCircle2, User } from 'lucide-react'
import Image from 'next/image'

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

interface BookingDialogProps {
  isOpen: boolean
  onClose: () => void
  booking?: any
  prefilledSlot?: { date: string; time: string; employeeId?: string } | null
}

export function BookingDialog({ isOpen, onClose, booking, prefilledSlot }: BookingDialogProps) {
  const { data: employees } = useEmployees()
  const { data: services } = useServices()
  const { data: clients } = useClients()
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([])
  const [surcharge, setSurcharge] = useState<number>(booking?.surcharge || 0)
  const [processingPayment, setProcessingPayment] = useState<'cash' | 'card' | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('')
  const [pickerView, setPickerView] = useState<'category' | 'subcategory' | 'service'>('category')
  const [searchTerm, setSearchTerm] = useState('')

  const createMutation = useCreateBooking()
  const updateMutation = useUpdateBooking(booking?.id || '')

  // Oblicz defaultValues na podstawie props
  const getDefaultValues = (): BookingFormData => {
    if (booking) {
      return {
        employeeId: booking.employee.id,
        serviceId: booking.service.id,
        clientName: booking.client.full_name,
        clientPhone: booking.client.phone,
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
    .find((svc) => svc.id === form.watch('serviceId'))

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

  const handleCompleteBooking = async (paymentMethod: 'cash' | 'card') => {
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

  const handleCancelBooking = async () => {
    if (confirm('Czy na pewno chcesz anulować tę wizytę?')) {
      try {
        await updateMutation.mutateAsync({ status: 'cancelled' })
        toast.success('Wizyta anulowana')
        onClose()
      } catch (error) {
        toast.error('Błąd podczas anulowania wizyty')
      }
    }
  }

  const handleDeleteBooking = async () => {
    if (confirm('Czy na pewno chcesz USUNĄĆ tę wizytę?')) {
      try {
        const response = await fetch(`/api/bookings/${booking.id}`, {
          method: 'DELETE',
        })
        if (!response.ok) throw new Error('Failed to delete booking')
        toast.success('Wizyta usunięta')
        onClose()
      } catch (error) {
        toast.error('Błąd podczas usuwania wizyty')
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass rounded-2xl">
        <DialogHeader>
          <DialogTitle className="gradient-text">
            {booking ? 'Szczegóły wizyty' : 'Nowa wizyta'}
          </DialogTitle>
        </DialogHeader>

        {booking ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Klient</Label>
                <p className="font-bold text-gray-900">{booking.client.full_name}</p>
                <p className="text-sm text-gray-600">{formatPhoneNumber(booking.client.phone)}</p>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Data i czas</Label>
                <div className="flex flex-col">
                  <p className="font-bold text-gray-900">{formatDateTime(booking.booking_date, booking.booking_time)}</p>
                  <p className="text-xs text-gray-500 font-medium">
                    Koniec: {format(addMinutes(new Date(`${booking.booking_date}T${booking.booking_time}`), booking.duration), 'HH:mm')}
                  </p>
                </div>
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
                <Badge className="mt-1" variant={booking.status === 'completed' ? 'success' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                  {BOOKING_STATUS_LABELS[booking.status]}
                </Badge>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Cena końcowa</Label>
                <p className="font-bold text-purple-600 text-lg">{formatPrice(booking.base_price + (surcharge || 0))}</p>
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
              {booking.status === 'scheduled' && (
                <>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      onClick={handleDeleteBooking}
                      disabled={updateMutation.isPending}
                      className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Usuń wizytę
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelBooking}
                      disabled={updateMutation.isPending}
                      className="rounded-lg"
                    >
                      Anuluj wizytę
                    </Button>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      onClick={() => handleCompleteBooking('cash')}
                      disabled={updateMutation.isPending}
                      className="gradient-button rounded-lg flex-1"
                    >
                      {processingPayment === 'cash' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Gotówka
                    </Button>
                    <Button
                      onClick={() => handleCompleteBooking('card')}
                      disabled={updateMutation.isPending}
                      className="gradient-button rounded-lg flex-1"
                    >
                      {processingPayment === 'card' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Karta
                    </Button>
                  </div>
                </>
              )}
            </DialogFooter>
          </div>
        ) : (
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

              <div className="space-y-2 col-span-full">
                <Label className="font-semibold">Usługa *</Label>
                <div className="glass rounded-xl p-4 min-h-[200px] flex flex-col">
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
                  className="glass rounded-lg"
                />
                {form.formState.errors.clientName && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.clientName.message}
                  </p>
                )}
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
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Telefon klienta *</Label>
                <Input
                  {...form.register('clientPhone')}
                  placeholder="+48 123 456 789"
                  className="glass rounded-lg"
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
                <Input type="date" {...form.register('bookingDate')} className="glass rounded-lg" />
                {form.formState.errors.bookingDate && (
                  <p className="text-sm text-red-600 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.bookingDate.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Godzina *</Label>
                <Input type="time" {...form.register('bookingTime')} className="glass rounded-lg" />
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
