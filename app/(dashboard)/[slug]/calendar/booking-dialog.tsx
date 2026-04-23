'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { Clock, PlusCircle, Trash2, UserX, XCircle, Banknote, CreditCard, Tag, MoreHorizontal, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingCartItem } from '@/components/calendar/booking-cart-item'
import BookingServicesEditor from '@/components/calendar/booking-services-editor'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateBooking, useUpdateBooking } from '@/hooks/use-bookings'
import { useClients, useCreateClient } from '@/hooks/use-clients'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useEmployees } from '@/hooks/use-employees'
import { useServices } from '@/hooks/use-services'
import { BOOKING_STATUS_LABELS } from '@/lib/constants'
import { formatDateTime, formatPhoneNumber, formatPrice } from '@/lib/formatters'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type DialogStep = 'client' | 'cart'

type BookingDialogProps = {
  isOpen: boolean
  onClose: () => void
  booking?: any
  preloadedGroupBookings?: any[] | null
  prefilledSlot?: { date: string; time: string; employeeId?: string } | null
}

type ClientOption = {
  id: string
  full_name: string
  phone: string
}

type EmployeeOption = {
  id: string
  first_name: string
  last_name: string | null
}

type ServiceOption = {
  id: string
  name: string
  price: number
  duration: number
}

type CartAddonOption = {
  id: string
  name: string
  price_delta: number
  duration_delta: number
}

type CartItemState = {
  serviceId: string | null
  employeeId: string | null
  bookingDate: string
  bookingTime: string
  addons: CartAddonOption[]
  selectedAddonIds: string[]
}

type DraftValidationResult = {
  warnings: string[]
}

type SmsTemplate = {
  id: string
  name: string
  body: string
  channel: string
}

const getInitialCartItem = (
  prefilledSlot?: { date: string; time: string; employeeId?: string } | null
): CartItemState => ({
  serviceId: null,
  employeeId: prefilledSlot?.employeeId ?? null,
  bookingDate: prefilledSlot?.date ?? new Date().toISOString().slice(0, 10),
  bookingTime: prefilledSlot?.time ?? '',
  addons: [],
  selectedAddonIds: [],
})

const formatEmployeeName = (employee: EmployeeOption | null) =>
  employee ? `${employee.first_name} ${employee.last_name ?? ''}`.trim() : ''

const formatCartStartTime = (item: CartItemState) =>
  item.bookingDate && item.bookingTime ? `${item.bookingDate} ${item.bookingTime}` : ''

const getServiceOptions = (servicesData: any[] | undefined): ServiceOption[] =>
  (servicesData ?? []).flatMap((category) =>
    (category.subcategories ?? []).flatMap((subcategory: any) =>
      (subcategory.services ?? []).map((service: any) => ({
        id: service.id,
        name: service.name,
        price: Number(service.price) || 0,
        duration: Number(service.duration) || 0,
      }))
    )
  )

export function BookingDialog({ isOpen, onClose, booking, preloadedGroupBookings, prefilledSlot }: BookingDialogProps) {
  const params = useParams<{ slug: string | string[] }>()
  const salonId = Array.isArray(params?.slug) ? params.slug[0] : params?.slug
  const { salonId: roleSalonId, isOwnerOrManager } = useCurrentRole()
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])

  const { data: employeesData } = useEmployees()
  const { data: servicesData } = useServices()
  const [clientSearch, setClientSearch] = useState('')
  const { data: clientsData, isFetching: isClientsFetching } = useClients(clientSearch)

  const createClientMutation = useCreateClient()
  const createBookingMutation = useCreateBooking()
  const updateMutation = useUpdateBooking(booking?.id ?? '')

  // Edit mode state
  const [surcharge, setSurcharge] = useState<number>(
    booking?.visit_group_id ? Number((booking as any).visit_group?.surcharge) || 0 : (booking?.surcharge ?? 0)
  )
  const [addonsTotal, setAddonsTotal] = useState(0)
  const [showVoucherPanel, setShowVoucherPanel] = useState(false)
  const [showEditServices, setShowEditServices] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherData, setVoucherData] = useState<{ id: string; code: string; current_balance: number; status: string } | null>(null)
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [clientVouchers, setClientVouchers] = useState<Array<{ id: string; code: string; current_balance: number }>>([])
  const [clientVouchersLoaded, setClientVouchersLoaded] = useState(false)
  const [groupBookings, setGroupBookings] = useState<any[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [step, setStep] = useState<DialogStep>('client')
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [noPhone, setNoPhone] = useState(false)
  const [cartItems, setCartItems] = useState<CartItemState[]>([getInitialCartItem(prefilledSlot)])
  const [categoryFilters, setCategoryFilters] = useState<Map<number, string>>(new Map())
  const [remoteValidationResults, setRemoteValidationResults] = useState<DraftValidationResult[]>([])
  const [isCheckingDraftAvailability, setIsCheckingDraftAvailability] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [forceOverride, setForceOverride] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([])
  const [smsPreview, setSmsPreview] = useState('')
  const [isSendingSms, setIsSendingSms] = useState(false)

  const employees = (employeesData ?? []) as EmployeeOption[]
  const canSendSms = isOwnerOrManager()
  const showSmsSection = canSendSms && Boolean(booking?.id)

  const [filteredEmployeesMap, setFilteredEmployeesMap] = useState<Map<number, EmployeeOption[]>>(new Map())
  useEffect(() => {
    const controllers: AbortController[] = []
    cartItems.forEach((item, index) => {
      if (!item.serviceId) {
        setFilteredEmployeesMap((prev) => {
          const next = new Map(prev)
          next.delete(index)
          return next
        })
        return
      }
      const controller = new AbortController()
      controllers.push(controller)
      fetch(`/api/employees?serviceId=${encodeURIComponent(item.serviceId)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((result) => {
          const list: EmployeeOption[] = Array.isArray(result?.employees) ? result.employees : []
          setFilteredEmployeesMap((prev) => {
            const next = new Map(prev)
            next.set(index, list)
            return next
          })
        })
        .catch((err) => {
          if (err.name !== 'AbortError') console.error(err)
        })
    })
    return () => controllers.forEach((c) => c.abort())
  }, [cartItems.map((i) => i.serviceId).join(',')])
  const categories = useMemo(
    () =>
      (servicesData ?? []).map((c: any) => ({
        id: c.category as string,
        name: c.category as string,
        subcategories: c.subcategories ?? [],
      })),
    [servicesData]
  )
  const services = useMemo(() => getServiceOptions(servicesData as any[] | undefined), [servicesData])
  const clients = (clientsData ?? []) as ClientOption[]
  const isGroupBooking = Boolean(booking?.visit_group_id)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setStep('client')
    setSelectedClient(null)
    setClientSearch('')
    setNewClientName('')
    setNewClientPhone('')
    setNoPhone(false)
    setCartItems([getInitialCartItem(prefilledSlot)])
    setCategoryFilters(new Map())
    setRemoteValidationResults([])
    setIsCheckingDraftAvailability(false)
    setConflictError(null)
    setForceOverride(false)
  }, [isOpen, prefilledSlot])

  useEffect(() => {
    if (!isOpen || booking) {
      return
    }

    setConflictError(null)
    setForceOverride(false)
  }, [booking, cartItems, isOpen, newClientName, newClientPhone, selectedClient?.id, step])

  const handleItemChange = (
    index: number,
    updates: Partial<{
      serviceId: string | null
      employeeId: string | null
      startTime: string
      selectedAddonIds: string[]
    }>
  ) => {
    setCartItems((current) =>
      current.map((item, itemIndex) => {
        const isTargetItem = itemIndex === index
        const [nextDatePart = '', nextTimePart = ''] =
          updates.startTime !== undefined ? updates.startTime.split('T') : []
        const shouldSyncDateAcrossCart =
          updates.startTime !== undefined &&
          !!nextDatePart &&
          nextDatePart !== current[index]?.bookingDate

        if (!isTargetItem && !shouldSyncDateAcrossCart) {
          return item
        }

        const nextItem: CartItemState = {
          ...item,
          serviceId:
            isTargetItem && updates.serviceId !== undefined ? updates.serviceId : item.serviceId,
          employeeId:
            isTargetItem && updates.employeeId !== undefined ? updates.employeeId : item.employeeId,
          addons: item.addons,
          selectedAddonIds:
            isTargetItem && updates.selectedAddonIds !== undefined
              ? updates.selectedAddonIds
              : item.selectedAddonIds,
          bookingDate: item.bookingDate,
          bookingTime: item.bookingTime,
        }

        if (updates.startTime !== undefined) {
          if (shouldSyncDateAcrossCart) {
            nextItem.bookingDate = nextDatePart
          } else if (isTargetItem) {
            nextItem.bookingDate = nextDatePart
          }

          if (isTargetItem) {
            nextItem.bookingTime = nextTimePart.slice(0, 5)
          }
        }

        return nextItem
      })
    )
  }

  const handleAddItem = () => {
    setCartItems((current) => {
      const anchorItem = current[current.length - 1] ?? getInitialCartItem(prefilledSlot)
      return [
        ...current,
        {
          serviceId: null,
          employeeId: anchorItem.employeeId,
          bookingDate: anchorItem.bookingDate,
          bookingTime: '',
          addons: [],
          selectedAddonIds: [],
        },
      ]
    })
  }

  const loadAddonsForCartItem = async (index: number, serviceId: string | null) => {
    if (!serviceId) {
      setCartItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, addons: [], selectedAddonIds: [] } : item
        )
      )
      return
    }

    setCartItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, addons: [], selectedAddonIds: [] } : item
      )
    )

    try {
      const response = await fetch(`/api/services/${serviceId}/addons`)

      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac dodatkow')
      }

      const data = await response.json()
      const addons = Array.isArray(data?.addons)
        ? data.addons.map((addon: any) => ({
            id: addon.id,
            name: addon.name,
            price_delta: Number(addon.price_delta) || 0,
            duration_delta: Number(addon.duration_delta) || 0,
          }))
        : []

      setCartItems((current) =>
        current.map((item, itemIndex) => {
          if (itemIndex !== index || item.serviceId !== serviceId) {
            return item
          }

          return {
            ...item,
            addons,
            selectedAddonIds: item.selectedAddonIds.filter((selectedAddonId) =>
              addons.some((addon: CartAddonOption) => addon.id === selectedAddonId)
            ),
          }
        })
      )
    } catch {
      setCartItems((current) =>
        current.map((item, itemIndex) => {
          if (itemIndex !== index || item.serviceId !== serviceId) {
            return item
          }

          return {
            ...item,
            addons: [],
            selectedAddonIds: [],
          }
        })
      )
    }
  }

  const saveBookingAddons = async (
    bookingsToProcess: Array<{ bookingId: string; item: CartItemState }>
  ) => {
    const bookingAddonRows = bookingsToProcess.flatMap(({ bookingId, item }) =>
      item.selectedAddonIds.flatMap((selectedAddonId) => {
        const addon = item.addons.find((entry) => entry.id === selectedAddonId)

        return addon
          ? [
              {
                booking_id: bookingId,
                addon_id: selectedAddonId,
                price_at_booking: addon.price_delta,
                duration_at_booking: addon.duration_delta,
              },
            ]
          : []
      })
    )

    if (bookingAddonRows.length === 0) {
      return
    }

    const { error } = await supabase.from('booking_addons').insert(bookingAddonRows)

    if (error) {
      throw error
    }
  }

  const handleRemoveItem = (index: number) => {
    setCartItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setCategoryFilters((current) => {
      const next = new Map<number, string>()

      current.forEach((value, key) => {
        if (key < index) {
          next.set(key, value)
          return
        }

        if (key > index) {
          next.set(key - 1, value)
        }
      })

      return next
    })
  }

  const totalDuration = cartItems.reduce((sum, item) => {
    const service = services.find((entry) => entry.id === item.serviceId)
    return sum + (service?.duration ?? 0)
  }, 0)

  const totalPrice = cartItems.reduce((sum, item) => {
    const service = services.find((entry) => entry.id === item.serviceId)
    const addonSum = item.selectedAddonIds.reduce((aSum, addonId) => {
      const addon = item.addons.find((a) => a.id === addonId)
      return aSum + (addon?.price_delta ?? 0)
    }, 0)
    return sum + (service?.price ?? 0) + addonSum
  }, 0)

  const localValidationResults = useMemo<DraftValidationResult[]>(() => {
    const results = cartItems.map(() => ({ warnings: [] as string[] }))

    const timeToMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number)
      return hours * 60 + (minutes || 0)
    }

    for (let i = 0; i < cartItems.length; i++) {
      for (let j = i + 1; j < cartItems.length; j++) {
        const first = cartItems[i]
        const second = cartItems[j]

        if (!first.serviceId || !second.serviceId || !first.employeeId || !second.employeeId) continue
        if (!first.bookingDate || !second.bookingDate || !first.bookingTime || !second.bookingTime) continue
        if (first.employeeId !== second.employeeId || first.bookingDate !== second.bookingDate) continue

        const firstService = services.find((entry) => entry.id === first.serviceId)
        const secondService = services.find((entry) => entry.id === second.serviceId)
        const firstStart = timeToMinutes(first.bookingTime)
        const firstEnd = firstStart + (firstService?.duration ?? 0)
        const secondStart = timeToMinutes(second.bookingTime)
        const secondEnd = secondStart + (secondService?.duration ?? 0)

        if (firstStart < secondEnd && secondStart < firstEnd) {
          results[i].warnings.push(`Naklada sie z pozycja ${j + 1} u tego samego pracownika.`)
          results[j].warnings.push(`Naklada sie z pozycja ${i + 1} u tego samego pracownika.`)
        }
      }
    }

    return results
  }, [cartItems, services])

  useEffect(() => {
    if (!isOpen || step !== 'cart') {
      setRemoteValidationResults([])
      setIsCheckingDraftAvailability(false)
      return
    }

    const hasCompleteItem = cartItems.some(
      (item) => item.serviceId && item.employeeId && item.bookingDate && item.bookingTime
    )

    if (!hasCompleteItem) {
      setRemoteValidationResults([])
      setIsCheckingDraftAvailability(false)
      return
    }

    let active = true
    const timeoutId = window.setTimeout(async () => {
      setIsCheckingDraftAvailability(true)
      try {
        const response = await fetch('/api/bookings/validate-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cartItems.map((item) => ({
              serviceId: item.serviceId,
              employeeId: item.employeeId,
              bookingDate: item.bookingDate,
              bookingTime: item.bookingTime,
            })),
          }),
        })

        if (!response.ok) {
          throw new Error('Nie udalo sie sprawdzic dostepnosci terminu')
        }

        const data = await response.json()
        if (active) {
          setRemoteValidationResults(Array.isArray(data.results) ? data.results : [])
        }
      } catch {
        if (active) {
          setRemoteValidationResults([])
        }
      } finally {
        if (active) {
          setIsCheckingDraftAvailability(false)
        }
      }
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [cartItems, isOpen, step])

  const combinedValidationResults = useMemo<DraftValidationResult[]>(
    () =>
      cartItems.map((_, index) => ({
        warnings: [
          ...(localValidationResults[index]?.warnings ?? []),
          ...(remoteValidationResults[index]?.warnings ?? []),
        ].filter((warning, warningIndex, warnings) => warnings.indexOf(warning) === warningIndex),
      })),
    [cartItems, localValidationResults, remoteValidationResults]
  )

  const hasDraftWarnings = combinedValidationResults.some((result) => result.warnings.length > 0)

  const canContinueToCart =
    selectedClient !== null ||
    (newClientName.trim().length >= 2 && (noPhone || newClientPhone.trim().length >= 3))

  const generateNoPhone = async (): Promise<string> => {
    const supabaseClient = createClient()
    const { data } = await supabaseClient
      .from('clients')
      .select('phone')
      .like('phone', '000000%')
      .order('phone', { ascending: false })
      .limit(1)
    const last = data?.[0]?.phone ?? '000000000'
    const lastNum = parseInt(last.replace(/\D/g, ''), 10) || 0
    const next = lastNum + 1
    return String(next).padStart(9, '0')
  }

  const resolveClientId = async () => {
    if (selectedClient) {
      return selectedClient.id
    }

    let phoneToSave: string
    if (noPhone) {
      phoneToSave = await generateNoPhone()
    } else {
      const rawPhone = newClientPhone.trim()
      const normalizedPhone = rawPhone.replace(/[\s\-\(\)]/g, '')
      const isValidPhone = /^\+?[0-9]{9,15}$/.test(normalizedPhone)
      phoneToSave = rawPhone
      if (!isValidPhone) {
        toast.warning('Numer telefonu jest niepoprawny — wizyta zostanie zapisana')
        const digitsOnly = rawPhone.replace(/\D/g, '')
        phoneToSave = digitsOnly.length >= 9 ? digitsOnly : `000${Date.now().toString().slice(-9)}`
      }
    }

    const createdClient = await createClientMutation.mutateAsync({
      fullName: newClientName.trim(),
      phone: phoneToSave,
    })

    return createdClient.client?.id ?? createdClient.id
  }

  const handleSave = async (saveWithOverride = false) => {
    if (isSaving) return
    if (!salonId) {
      toast.error('Nie znaleziono salonu')
      return
    }

    for (const [index, item] of cartItems.entries()) {
      if (!item.serviceId || !item.employeeId || !item.bookingDate || !item.bookingTime) {
        toast.error(`Uzupelnij pozycje ${index + 1}`)
        return
      }
    }

    const timeToMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + (m || 0)
    }
    for (let i = 0; i < cartItems.length; i++) {
      for (let j = i + 1; j < cartItems.length; j++) {
        const a = cartItems[i]
        const b = cartItems[j]
        if (a.employeeId !== b.employeeId || a.bookingDate !== b.bookingDate) continue
        if (!a.bookingTime || !b.bookingTime) continue
        const svcA = services.find((s) => s.id === a.serviceId)
        const svcB = services.find((s) => s.id === b.serviceId)
        const startA = timeToMinutes(a.bookingTime)
        const endA = startA + (svcA?.duration ?? 0)
        const startB = timeToMinutes(b.bookingTime)
        const endB = startB + (svcB?.duration ?? 0)
        if (startA < endB && startB < endA) {
          toast.error(`Pozycje ${i + 1} i ${j + 1} nakładają się u tego samego pracownika — zmień termin jednej z nich`)
          return
        }
      }
    }

    if (hasDraftWarnings && !saveWithOverride) {
      toast.error('Popraw terminy oznaczone ostrzezeniami przed zapisaniem wizyty')
      return
    }

    setIsSaving(true)
    try {
      if (!saveWithOverride) {
        setConflictError(null)
        setForceOverride(false)
      }

      const clientId = await resolveClientId()
      if (!clientId) {
        throw new Error('Nie udalo sie zapisac klienta')
      }

      if (cartItems.length === 1) {
        const item = cartItems[0]
        const service = services.find((entry) => entry.id === item.serviceId)

        if (!service) {
          throw new Error('Nie wybrano uslugi')
        }

        const bookingResult = await createBookingMutation.mutateAsync({
          employeeId: item.employeeId!,
          serviceId: item.serviceId!,
          forceOverride: saveWithOverride,
          clientId,
          bookingDate: item.bookingDate,
          bookingTime: item.bookingTime,
          duration: service.duration,
          source: 'manual',
        })

        const bookingId =
          bookingResult?.booking?.id ?? bookingResult?.bookingId ?? bookingResult?.id ?? null

        if (bookingId) {
          await saveBookingAddons([{ bookingId, item }])
        }
      } else {
        const response = await fetch('/api/bookings/group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            salonId,
            forceOverride: saveWithOverride,
            items: cartItems.map((item) => ({
              serviceId: item.serviceId!,
              employeeId: item.employeeId!,
              startTime: `${item.bookingDate}T${item.bookingTime}`,
            })),
          }),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => null)
          if (response.status === 409 && error?.conflictingItemIndex !== undefined) {
            setConflictError(
              `Termin niedostepny dla uslugi ${error.conflictingItemIndex + 1}. Wybierz inny termin albo zapisz mimo konfliktu.`
            )
            setForceOverride(false)
            return
          }
          if (response.status === 409 && error?.message) {
            setConflictError(error.message)
            setForceOverride(false)
            return
          }
          if (response.status === 409 && error?.error) {
            setConflictError(error.error)
            setForceOverride(false)
            return
          }
          if (response.status === 409) {
            setConflictError('Wykryto konflikt terminu. Wybierz inny termin albo zapisz mimo konfliktu.')
            setForceOverride(false)
            return
          }
          const errorCode = error?.error
          const errorMessage =
            errorCode === 'EQUIPMENT_CONFLICT'
              ? 'Wybrany sprzęt jest już zajęty w tym terminie. Wybierz inny termin lub innego pracownika.'
              : error?.message || errorCode || 'Nie udało się zapisać grupy wizyt'
          throw new Error(errorMessage)
        }

        const data = await response.json()
        const createdBookings = Array.isArray(data?.bookings) ? data.bookings : []

        await saveBookingAddons(
          createdBookings.flatMap((createdBooking: any, index: number) =>
            createdBooking?.id && cartItems[index]
              ? [{ bookingId: createdBooking.id as string, item: cartItems[index] }]
              : []
          )
        )

        await queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
        toast.success('Wizyta grupowa utworzona')
      }

      setConflictError(null)
      setForceOverride(false)
      onClose()
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined
      const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac wizyty'
      if (status === 409) {
        setConflictError(message)
        setForceOverride(false)
        return
      }
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    setSurcharge(
      booking?.visit_group_id
        ? Number((booking as any).visit_group?.surcharge) || 0
        : (booking?.surcharge ?? 0)
    )
    setShowVoucherPanel(false)
    setVoucherCode('')
    setVoucherData(null)
    setVoucherLoading(false)
    setClientVouchers([])
    setClientVouchersLoaded(false)
  }, [booking?.id, isOpen])

  useEffect(() => {
    if (!isOpen || !booking?.id || !canSendSms || !roleSalonId) {
      setSmsTemplates([])
      setSelectedTemplateId(null)
      setSmsPreview('')
      return
    }

    let active = true

    const fetchSmsTemplates = async () => {
      try {
        const response = await fetch(`/api/crm/templates?salonId=${encodeURIComponent(roleSalonId)}`)
        if (!response.ok) {
          throw new Error('Nie udalo sie pobrac szablonow SMS')
        }

        const data = await response.json()
        const allTemplates = Array.isArray(data?.templates) ? data.templates : []
        const filteredTemplates = allTemplates
          .filter((template: any) => template?.channel === 'sms' || template?.channel === 'both')
          .map((template: any) => ({
            id: String(template.id ?? ''),
            name: String(template.name ?? ''),
            body: String(template.body ?? ''),
            channel: String(template.channel ?? ''),
          }))
          .filter((template: SmsTemplate) => template.id.length > 0)

        if (active) {
          setSmsTemplates(filteredTemplates)
        }
      } catch {
        if (active) {
          setSmsTemplates([])
        }
      }
    }

    void fetchSmsTemplates()

    return () => {
      active = false
    }
  }, [booking?.id, canSendSms, isOpen, roleSalonId])

  useEffect(() => {
    if (!showSmsSection || !selectedTemplateId) {
      setSmsPreview('')
      return
    }

    const template = smsTemplates.find((entry) => entry.id === selectedTemplateId)
    if (!template) {
      setSmsPreview('')
      return
    }

    const serviceName =
      booking?.service?.name ??
      (cartItems[0]?.serviceId ? services.find((entry) => entry.id === cartItems[0]?.serviceId)?.name : '') ??
      ''
    const appointmentTime = `${booking?.booking_date ?? ''} ${booking?.booking_time ?? ''}`.trim()
    const preview = template.body
      .replaceAll('{{client_name}}', booking?.client?.full_name ?? '')
      .replaceAll('{{service_name}}', serviceName)
      .replaceAll('{{appointment_time}}', appointmentTime)

    setSmsPreview(preview)
  }, [booking?.booking_date, booking?.booking_time, booking?.client?.full_name, booking?.service?.name, cartItems, selectedTemplateId, services, showSmsSection, smsTemplates])

  useEffect(() => {
    if (!booking?.id || !isOpen) {
      setAddonsTotal(0)
      return
    }
    supabase
      .from('booking_addons')
      .select('price_at_booking')
      .eq('booking_id', booking.id)
      .then(({ data }) => {
        const sum = (data ?? []).reduce((acc: number, row: { price_at_booking: number | null }) => acc + (row.price_at_booking ?? 0), 0)
        setAddonsTotal(sum)
      })
  }, [booking?.id, isOpen, supabase])

  useEffect(() => {
    if (!booking?.visit_group_id || !isOpen) {
      setGroupBookings([])
      return
    }

    if (preloadedGroupBookings != null) {
      setGroupBookings(preloadedGroupBookings)
      return
    }

    let active = true

    const fetchGroupBookings = async () => {
      try {
        const response = await fetch(
          `/api/bookings?visitGroupId=${encodeURIComponent(booking.visit_group_id)}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch group bookings')
        }

        const data = await response.json()
        if (active) {
          setGroupBookings(Array.isArray(data) ? data : [])
        }
      } catch {
        if (active) {
          setGroupBookings([])
        }
      }
    }

    fetchGroupBookings()

    return () => {
      active = false
    }
  }, [booking?.visit_group_id, isOpen, preloadedGroupBookings])

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
      } catch {
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

  const handleCompleteBooking = async (paymentMethod: string) => {
    try {
      if (booking?.visit_group_id) {
        const response = await fetch(`/api/bookings/group/${booking.visit_group_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            paymentMethod,
            surcharge: surcharge || 0,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to complete group booking')
        }

        await queryClient.invalidateQueries({ queryKey: ['bookings'] })
      } else {
        await updateMutation.mutateAsync({
          status: 'completed',
          paymentMethod,
          surcharge: surcharge || 0,
        })
      }

      onClose()
    } catch {
      toast.error('Blad podczas konczenia wizyty')
    }
  }

  const handleValidateVoucher = async () => {
    const normalizedCode = voucherCode.trim()
    if (!normalizedCode || !salonId) {
      return
    }

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
    } catch {
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
        toast.error('Blad przy potraceniu vouchera')
      }
    } catch {
      toast.error('Blad przy potraceniu vouchera')
    } finally {
      setVoucherLoading(false)
    }
  }

  const handleNoShow = async () => {
    if (
      confirm('Oznaczyc wizyte jako "Nie przyszedl"? Naruszenie zostanie zapisane na koncie klienta.')
    ) {
      try {
        if (booking?.visit_group_id) {
          const response = await fetch(`/api/bookings/group/${booking.visit_group_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'no_show' }),
          })

          if (!response.ok) {
            throw new Error('Failed to mark group booking as no-show')
          }

          await queryClient.invalidateQueries({ queryKey: ['bookings'] })
        } else {
          await updateMutation.mutateAsync({ status: 'no_show' })
        }

        onClose()
      } catch {
        toast.error('Blad podczas zapisywania nieobecnosci')
      }
    }
  }

  const handleCancelBooking = async () => {
    if (confirm('Czy na pewno chcesz anulowac te wizyte?')) {
      try {
        if (booking?.visit_group_id) {
          const response = await fetch(`/api/bookings/group/${booking.visit_group_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
          })

          if (!response.ok) {
            throw new Error('Failed to cancel group booking')
          }

          await queryClient.invalidateQueries({ queryKey: ['bookings'] })
        } else {
          await updateMutation.mutateAsync({ status: 'cancelled' })
        }

        onClose()
      } catch {
        toast.error('Blad podczas anulowania wizyty')
      }
    }
  }

  const handleDeleteBooking = async () => {
    if (
      confirm(
        'Czy na pewno chcesz USUNAC te wizyte?\n\n' +
          'Wizyta zostanie przeniesiona do archiwum i nie bedzie widoczna w kalendarzu.\n' +
          'Administrator moze ja przywrocic.\n\n' +
          'Jesli chcesz tylko anulowac wizyte (bez usuwania), uzyj przycisku "Anuluj wizyte".'
      )
    ) {
      try {
        const response = await fetch(`/api/bookings/${booking.id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete booking')
        }

        await queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
        toast.success('Wizyta usunieta')
        onClose()
      } catch {
        toast.error('Blad podczas usuwania wizyty')
      }
    }
  }

  const handleSendSms = async () => {
    if (!booking?.id || !selectedTemplateId) {
      return
    }

    setIsSendingSms(true)
    try {
      const response = await fetch(`/api/bookings/${booking.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: selectedTemplateId }),
      })

      if (!response.ok) {
        throw new Error('Nie udalo sie wyslac SMS')
      }

      toast.success(`SMS wysłany do ${booking.client?.full_name || 'klienta'}`)
    } catch {
      toast.error('Nie udało się wysłać SMS')
    } finally {
      setIsSendingSms(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{booking ? 'Edycja wizyty' : 'Nowa wizyta'}</DialogTitle>
        </DialogHeader>

        {booking ? (
          <div className="flex-1 space-y-6 overflow-y-auto pb-4 pr-1">
            <div className="space-y-4">
              {booking.visit_group_id && (
                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">
                    Wizyty w grupie
                  </Label>
                  <div className="mt-3 space-y-2">
                    {groupBookings.map((groupBooking) => (
                      <div
                        key={groupBooking.id}
                        className="flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-semibold text-gray-900">
                          {groupBooking.service?.name ?? '-'}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {groupBooking.employee?.first_name} {groupBooking.employee?.last_name}
                        </span>
                        <span className="font-medium text-purple-600 text-xs">
                          {groupBooking.booking_time?.slice(0, 5)} · {groupBooking.duration} min
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">Klient</Label>
                  <p className="font-bold text-gray-900">{booking.client.full_name}</p>
                  <p className="text-sm text-gray-600">{formatPhoneNumber(booking.client.phone)}</p>
                </div>

                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">
                    Data i godzina
                  </Label>
                  <p className="font-bold text-gray-900">
                    {formatDateTime(booking.booking_date, booking.booking_time)}
                  </p>
                </div>

                {!isGroupBooking && (
                  <div className="glass rounded-lg p-3">
                    <Label className="text-xs font-semibold uppercase text-gray-600">Usluga</Label>
                    <p className="font-bold text-gray-900">{booking.service.name}</p>
                    <div className="mt-1 flex items-center gap-1 text-sm text-gray-600">
                      <Clock className="h-3 w-3" />
                      {booking.duration} min
                    </div>
                  </div>
                )}

                {!isGroupBooking && (
                  <div className="glass rounded-lg p-3">
                    <Label className="text-xs font-semibold uppercase text-gray-600">Pracownik</Label>
                    <p className="font-bold text-gray-900">
                      {booking.employee.first_name} {booking.employee.last_name}
                    </p>
                  </div>
                )}

                {booking.equipment_name && (
                  <div className="glass rounded-lg p-3">
                    <Label className="text-xs font-semibold uppercase text-gray-600">
                      Sprzęt / Stanowisko
                    </Label>
                    <p className="font-bold text-gray-900">{booking.equipment_name}</p>
                  </div>
                )}

                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">Status</Label>
                  <Badge
                    className="mt-1"
                    variant={
                      booking.status === 'completed'
                        ? 'success'
                        : booking.status === 'cancelled' || booking.status === 'no_show'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </Badge>
                </div>

                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">
                    Cena koncowa
                  </Label>
                  <p className="text-lg font-bold text-purple-600">
                    {formatPrice(
                      isGroupBooking
                        ? (Number(booking.visit_group?.total_price) || 0) + surcharge
                        : booking.base_price + addonsTotal + surcharge
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-600">
                      Baza: {formatPrice(isGroupBooking ? Number(booking.visit_group?.total_price) || 0 : booking.base_price)}
                      {!isGroupBooking && addonsTotal > 0 && <span className="ml-1 text-purple-500">+ Dodatki: {formatPrice(addonsTotal)}</span>}
                    </span>
                    {booking.status === 'scheduled' ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-600">+ Doplata:</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={surcharge}
                          onChange={(e) => setSurcharge(parseFloat(e.target.value) || 0)}
                          className="h-6 w-20 px-1 text-xs"
                        />
                      </div>
                    ) : (
                      surcharge > 0 && (
                        <span className="text-xs text-gray-600">
                          + Doplata: {formatPrice(surcharge)}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>

              {booking.notes && (
                <div className="glass rounded-lg p-3">
                  <Label className="text-xs font-semibold uppercase text-gray-600">Notatki</Label>
                  <p className="mt-1 text-sm text-gray-700">{booking.notes}</p>
                </div>
              )}

              {showSmsSection && (
                <div className="space-y-3">
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase text-gray-600">
                      Wyślij SMS do klienta
                    </Label>
                    {smsTemplates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Brak szablonów SMS</p>
                    ) : (
                      <>
                        <Select
                          value={selectedTemplateId ?? ''}
                          onValueChange={(value) => setSelectedTemplateId(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Wybierz szablon SMS" />
                          </SelectTrigger>
                          <SelectContent>
                            {smsTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedTemplateId && (
                          <Textarea readOnly rows={3} value={smsPreview} />
                        )}

                        <Button
                          type="button"
                          onClick={handleSendSms}
                          disabled={!selectedTemplateId || isSendingSms}
                          className="w-full sm:w-auto"
                        >
                          {isSendingSms ? 'Wysyłanie...' : 'Wyślij SMS'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="sticky bottom-0 flex-wrap gap-2 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {(booking.status === 'scheduled' || booking.status === 'confirmed') && (
                  <>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        variant="outline"
                        onClick={handleDeleteBooking}
                        className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Usuń wizytę
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleNoShow}
                        className="rounded-lg border-orange-300 text-orange-600 hover:bg-orange-50"
                      >
                        <UserX className="mr-1.5 h-3.5 w-3.5" />
                        Nie przyszedł
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleCancelBooking}
                        className="rounded-lg"
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Anuluj wizytę
                      </Button>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        onClick={() => handleCompleteBooking('cash')}
                        className="gradient-button flex-1 rounded-lg"
                      >
                        <Banknote className="mr-1.5 h-3.5 w-3.5" />
                        Gotówka
                      </Button>
                      <Button
                        onClick={() => handleCompleteBooking('card')}
                        className="gradient-button flex-1 rounded-lg"
                      >
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        Karta
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowVoucherPanel(!showVoucherPanel)}
                        className="rounded-lg"
                      >
                        <Tag className="mr-1.5 h-3.5 w-3.5" />
                        Voucher
                      </Button>
                    </div>
                    {showVoucherPanel && (
                      <div className="glass w-full space-y-3 rounded-lg p-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
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
                          <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
                            <p className="text-sm font-semibold text-green-800">
                              Voucher: {voucherData.code}
                            </p>
                            <p className="text-sm text-green-700">
                              Saldo: {formatPrice(voucherData.current_balance)}
                            </p>
                            <Button
                              type="button"
                              onClick={handleCompleteWithVoucher}
                              disabled={voucherLoading}
                              className="rounded-lg bg-green-600 text-white hover:bg-green-700"
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

              {booking?.id && (
                <div className="space-y-4">
                  <Separator />
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-700"
                      onClick={() => setShowEditServices((v) => !v)}
                    >
                      Usługi w wizycie
                      <ChevronDown className={cn('h-4 w-4 transition-transform', showEditServices && 'rotate-180')} />
                    </button>
                    {showEditServices && <BookingServicesEditor
                      bookingId={booking.id}
                      groupId={booking.visit_group_id ?? undefined}
                      initialServices={
                        groupBookings && groupBookings.length > 0
                          ? groupBookings.map((b) => ({
                              id: b.id,
                              service_id: b.service_id ?? null,
                              employee_id: b.employee_id ?? null,
                              start_time: b.start_time ?? b.booking_time ?? '',
                              addon_ids: [],
                            }))
                          : [
                              {
                                id: booking.id,
                                service_id: booking.service_id ?? null,
                                employee_id: booking.employee_id ?? null,
                                start_time: booking.start_time ?? booking.booking_time ?? '',
                                addon_ids: [],
                              },
                            ]
                      }
                      availableServices={services}
                      availableEmployees={employees.map((employee) => ({
                        ...employee,
                        last_name: employee.last_name ?? '',
                      }))}
                      onSaved={() => {
                        void queryClient.invalidateQueries({ queryKey: ['bookings'], exact: false })
                        onClose()
                      }}
                    />}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : step === 'client' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="client-search">Szukaj klienta</Label>
              <Input
                id="client-search"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                placeholder="Wpisz imie lub telefon"
              />
            </div>

            <div className="space-y-2">
              <Label>Istniejacy klienci</Label>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {isClientsFetching ? (
                  <p className="text-sm text-muted-foreground">Ladowanie klientow...</p>
                ) : clients.length > 0 ? (
                  clients.map((client) => {
                    const isSelected = selectedClient?.id === client.id

                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClient(client)
                          setNewClientName('')
                          setNewClientPhone('')
                          setNoPhone(false)
                        }}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="font-medium">{client.full_name}</div>
                        <div className="text-muted-foreground">{client.phone}</div>
                      </button>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Brak wynikow</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-client-name">Nowy klient</Label>
                <Input
                  id="new-client-name"
                  value={newClientName}
                  onChange={(event) => {
                    setSelectedClient(null)
                    setNewClientName(event.target.value)
                  }}
                  placeholder="Imie i nazwisko"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-client-phone">Telefon</Label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground">
                    <Checkbox
                      id="no-phone"
                      checked={noPhone}
                      onCheckedChange={(checked) => {
                        setNoPhone(!!checked)
                        if (checked) {
                          setSelectedClient(null)
                          setNewClientPhone('')
                        }
                      }}
                    />
                    Brak telefonu
                  </label>
                </div>
                <Input
                  id="new-client-phone"
                  value={newClientPhone}
                  disabled={noPhone}
                  onChange={(event) => {
                    setSelectedClient(null)
                    setNewClientPhone(event.target.value)
                  }}
                  placeholder={noPhone ? 'Zostanie przypisany auto-numer' : 'Telefon klienta'}
                />
              </div>
            </div>

            <DialogFooter className="border-t bg-background/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Button type="button" variant="outline" onClick={onClose}>
                Anuluj
              </Button>
              <Button type="button" disabled={!canContinueToCart} onClick={() => setStep('cart')}>
                Dalej
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto pr-1">
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <div className="font-medium">
                {selectedClient?.full_name || newClientName || 'Nowy klient'}
              </div>
              <div className="text-muted-foreground">
                {selectedClient?.phone || newClientPhone || 'Brak telefonu'}
              </div>
            </div>

            <div className="space-y-4">
              {cartItems.map((item, index) => {
                const service = services.find((entry) => entry.id === item.serviceId) ?? null
                const employee = employees.find((entry) => entry.id === item.employeeId) ?? null
                const employeesForItem = filteredEmployeesMap.has(index) ? filteredEmployeesMap.get(index)! : employees
                const selectedCategoryId = categoryFilters.get(index) ?? ''
                const filteredServices = selectedCategoryId
                  ? categories
                      .filter((category) => category.id === selectedCategoryId)
                      .flatMap((category) =>
                        category.subcategories.flatMap((subcategory: any) =>
                          (subcategory.services ?? []).map((entry: any) => ({
                            id: entry.id,
                            name: entry.name,
                            price: Number(entry.price) || 0,
                            duration: Number(entry.duration) || 0,
                          }))
                        )
                      )
                  : services

                return (
                  <div key={index} className="space-y-3">
                    <BookingCartItem
                      index={index}
                      service={service}
                      employee={
                        employee
                          ? { id: employee.id, name: formatEmployeeName(employee) }
                          : null
                      }
                      addons={item.addons}
                      selectedAddonIds={item.selectedAddonIds}
                      onAddonSelect={(addonId) => {
                        if (!addonId) return handleItemChange(index, { selectedAddonIds: [] })
                        const current = item.selectedAddonIds
                        const next = current.includes(addonId)
                          ? current.filter((id) => id !== addonId)
                          : [...current, addonId]
                        handleItemChange(index, { selectedAddonIds: next })
                      }}
                      startTime={formatCartStartTime(item)}
                      warnings={combinedValidationResults[index]?.warnings ?? []}
                      isCheckingAvailability={
                        isCheckingDraftAvailability &&
                        !!item.serviceId &&
                        !!item.employeeId &&
                        !!item.bookingDate &&
                        !!item.bookingTime
                      }
                      onRemove={() => handleRemoveItem(index)}
                      onChange={(updates) => handleItemChange(index, updates)}
                    />

                    <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="space-y-2">
                        <Label htmlFor={`category-${index}`}>Kategoria</Label>
                        <select
                          id={`category-${index}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={selectedCategoryId}
                          onChange={(event) => {
                            const nextCategoryId = event.target.value

                            setCategoryFilters((current) => {
                              const next = new Map(current)

                              if (nextCategoryId) {
                                next.set(index, nextCategoryId)
                              } else {
                                next.delete(index)
                              }

                              return next
                            })
                            handleItemChange(index, { serviceId: null, selectedAddonIds: [] })
                            void loadAddonsForCartItem(index, null)
                          }}
                        >
                          <option value="">Wszystkie kategorie</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`service-${index}`}>Usluga</Label>
                        <select
                          id={`service-${index}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={item.serviceId ?? ''}
                          onChange={(event) => {
                            const nextServiceId = event.target.value || null

                            handleItemChange(index, {
                              serviceId: nextServiceId,
                              selectedAddonIds: [],
                            })
                            void loadAddonsForCartItem(index, nextServiceId)
                          }}
                        >
                          <option value="">Wybierz usluge</option>
                          {filteredServices.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name} ({formatPrice(entry.price)} / {entry.duration} min)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`employee-${index}`}>Pracownik</Label>
                        <select
                          id={`employee-${index}`}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={item.employeeId ?? ''}
                          onChange={(event) =>
                            handleItemChange(index, {
                              employeeId: event.target.value || null,
                            })
                          }
                        >
                          <option value="">Wybierz pracownika</option>
                          {employeesForItem.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {formatEmployeeName(entry)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`date-${index}`}>Data</Label>
                        <Input
                          id={`date-${index}`}
                          type="date"
                          value={item.bookingDate}
                          onChange={(event) =>
                            handleItemChange(index, {
                              startTime: `${event.target.value}T${item.bookingTime}`,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`time-${index}`}>Godzina</Label>
                        <Input
                          id={`time-${index}`}
                          type="time"
                          value={item.bookingTime}
                          onChange={(event) =>
                            handleItemChange(index, {
                              startTime: `${item.bookingDate}T${event.target.value}`,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleAddItem}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Dodaj kolejna usluge
            </Button>

            {(conflictError || hasDraftWarnings) && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-3">
                  {conflictError && <p>{conflictError}</p>}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="force-override"
                      checked={forceOverride}
                      onCheckedChange={(checked) => setForceOverride(checked === true)}
                    />
                    <Label htmlFor="force-override" className="cursor-pointer leading-5">
                      Akceptuję kolizję — zapisz wizytę mimo to
                    </Label>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="sticky bottom-0 flex-col items-stretch gap-4 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <div>Laczny czas: {totalDuration} min</div>
                <div>Laczna cena: {formatPrice(totalPrice)}</div>
                {hasDraftWarnings ? (
                  <div className="text-amber-700">Popraw oznaczone konflikty przed zapisem.</div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setStep('client')}>
                  Wstecz
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Anuluj
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={
                    isSaving ||
                    isCheckingDraftAvailability ||
                    hasDraftWarnings ||
                    createBookingMutation.isPending ||
                    createClientMutation.isPending
                  }
                >
                  {isCheckingDraftAvailability ? 'Sprawdzam...' : 'Zapisz wizyte'}
                </Button>
                {(conflictError || hasDraftWarnings) && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleSave(true)}
                    disabled={
                      !forceOverride ||
                      isSaving ||
                      createBookingMutation.isPending ||
                      createClientMutation.isPending
                    }
                  >
                    Zapisz mimo konfliktu
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
