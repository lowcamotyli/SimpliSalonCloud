'use client'

import { useEffect, useState } from 'react'
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
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatPhoneNumber, parsePhoneNumber, formatPrice, formatDateTime } from '@/lib/formatters'
import { toast } from 'sonner'
import { Clock, DollarSign, AlertCircle } from 'lucide-react'

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

  const handleCompleteBooking = async (paymentMethod: string) => {
    try {
      await updateMutation.mutateAsync({
        status: 'completed',
        paymentMethod,
      })
      toast.success('Wizyta zakończona')
      onClose()
    } catch (error) {
      toast.error('Błąd podczas kończenia wizyty')
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
                <Badge className="mt-1" variant={booking.status === 'completed' ? 'success' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                  {BOOKING_STATUS_LABELS[booking.status]}
                </Badge>
              </div>

              <div className="glass p-3 rounded-lg">
                <Label className="text-xs text-gray-600 uppercase font-semibold">Cena</Label>
                <p className="font-bold text-purple-600 text-lg">{formatPrice(booking.total_price)}</p>
                {booking.surcharge > 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    Baza: {formatPrice(booking.base_price)} + Dopłata: {formatPrice(booking.surcharge)}
                  </p>
                )}
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
                      className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Usuń wizytę
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
                  </div>
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
                <select
                  {...form.register('serviceId')}
                  className="w-full glass rounded-lg px-3 py-2"
                >
                  <option value="">Wybierz usługę</option>
                  {services?.map((cat) =>
                    cat.subcategories.map((sub) =>
                      sub.services.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {svc.name} - {formatPrice(svc.price)} ({svc.duration} min)
                        </option>
                      ))
                    )
                  )}
                </select>
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
