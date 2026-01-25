'use client'

import { useEffect } from 'react'
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

const bookingFormSchema = z.object({
  employeeId: z.string().min(1, 'Wybierz pracownika'),
  serviceId: z.string().min(1, 'Wybierz usługę'),
  clientName: z.string().min(2, 'Minimum 2 znaki'),
  clientPhone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: YYYY-MM-DD'),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, 'Godzina: HH:mm'),
  notes: z.string().optional(),
})

type BookingFormData = z.infer<typeof bookingFormSchema>

interface BookingDialogProps {
  isOpen: boolean
  onClose: () => void
  booking?: any
}

export function BookingDialog({ isOpen, onClose, booking }: BookingDialogProps) {
  const { data: employees } = useEmployees()
  const { data: services } = useServices()
  
  const createMutation = useCreateBooking()
  const updateMutation = useUpdateBooking(booking?.id || '')

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      employeeId: '',
      serviceId: '',
      clientName: '',
      clientPhone: '',
      bookingDate: new Date().toISOString().split('T')[0],
      bookingTime: '10:00',
      notes: '',
    },
  })

  useEffect(() => {
    if (booking) {
      form.reset({
        employeeId: booking.employee.id,
        serviceId: booking.service.id,
        clientName: booking.client.full_name,
        clientPhone: booking.client.phone,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        notes: booking.notes || '',
      })
    } else {
      form.reset({
        employeeId: '',
        serviceId: '',
        clientName: '',
        clientPhone: '',
        bookingDate: new Date().toISOString().split('T')[0],
        bookingTime: '10:00',
        notes: '',
      })
    }
  }, [booking, form])

  const selectedService = services
    ?.flatMap((cat) => cat.subcategories)
    .flatMap((sub) => sub.services)
    .find((svc) => svc.id === form.watch('serviceId'))

  const handleSubmit = async (data: BookingFormData) => {
    if (booking) {
      // Update existing booking (status change only for now)
      await updateMutation.mutateAsync({
        notes: data.notes,
      })
    } else {
      // Create new booking
      await createMutation.mutateAsync({
        ...data,
        duration: selectedService?.duration || 60,
        source: 'manual',
      })
    }
    onClose()
  }

  const handleCompleteBooking = async (paymentMethod: string) => {
    await updateMutation.mutateAsync({
      status: 'completed',
      paymentMethod,
    })
    onClose()
  }

  const handleCancelBooking = async () => {
    if (confirm('Czy na pewno chcesz anulować tę wizytę?')) {
      await updateMutation.mutateAsync({ status: 'cancelled' })
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {booking ? 'Szczegóły wizyty' : 'Nowa wizyta'}
          </DialogTitle>
        </DialogHeader>

        {booking ? (
          // View mode
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-gray-600">Klient</Label>
                <p className="font-medium">{booking.client.full_name}</p>
                <p className="text-sm text-gray-600">{booking.client.phone}</p>
              </div>

              <div>
                <Label className="text-gray-600">Data i godzina</Label>
                <p className="font-medium">
                  {booking.booking_date} {booking.booking_time}
                </p>
              </div>

              <div>
                <Label className="text-gray-600">Usługa</Label>
                <p className="font-medium">{booking.service.name}</p>
                <p className="text-sm text-gray-600">{booking.duration} min</p>
              </div>

              <div>
                <Label className="text-gray-600">Pracownik</Label>
                <p className="font-medium">
                  {booking.employee.first_name} {booking.employee.last_name}
                </p>
              </div>

              <div>
                <Label className="text-gray-600">Status</Label>
                <div>
                  <Badge
                    variant={
                      booking.status === 'completed'
                        ? 'success'
                        : booking.status === 'cancelled'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {BOOKING_STATUS_LABELS[booking.status]}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-gray-600">Cena</Label>
                <p className="font-medium">{booking.total_price.toFixed(2)} zł</p>
                {booking.surcharge > 0 && (
                  <p className="text-sm text-gray-600">
                    (baza: {booking.base_price.toFixed(2)} + dopłata: {booking.surcharge.toFixed(2)})
                  </p>
                )}
              </div>
            </div>

            {booking.notes && (
              <div>
                <Label className="text-gray-600">Notatki</Label>
                <p className="text-sm">{booking.notes}</p>
              </div>
            )}

            <DialogFooter className="gap-2">
              {booking.status === 'scheduled' && (
                <>
                  <Button
                    variant="destructive"
                    onClick={handleCancelBooking}
                  >
                    Anuluj wizytę
                  </Button>
                  <Button
                    onClick={() => handleCompleteBooking('cash')}
                  >
                    Gotówka
                  </Button>
                  <Button
                    onClick={() => handleCompleteBooking('card')}
                  >
                    Karta
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        ) : (
          // Create mode
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* TODO: Use GPT to expand this form with:
                 - Employee select dropdown
                 - Service category/subcategory/service cascading selects
                 - Client autocomplete (search existing clients)
                 - Date picker
                 - Time picker
                 - Notes textarea
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pracownik *</Label>
                <select
                  {...form.register('employeeId')}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="">Wybierz pracownika</option>
                  {employees?.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.employeeId && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.employeeId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Usługa *</Label>
                <select
                  {...form.register('serviceId')}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="">Wybierz usługę</option>
                  {services?.map((cat) =>
                    cat.subcategories.map((sub) =>
                      sub.services.map((svc) => (
                        <option key={svc.id} value={svc.id}>
                          {svc.name} - {svc.price} zł ({svc.duration} min)
                        </option>
                      ))
                    )
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Imię i nazwisko klienta *</Label>
                <Input {...form.register('clientName')} />
                {form.formState.errors.clientName && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.clientName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Telefon klienta *</Label>
                <Input {...form.register('clientPhone')} />
                {form.formState.errors.clientPhone && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.clientPhone.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" {...form.register('bookingDate')} />
              </div>

              <div className="space-y-2">
                <Label>Godzina *</Label>
                <Input type="time" {...form.register('bookingTime')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notatki</Label>
              <Input {...form.register('notes')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Anuluj
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Zapisz
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}