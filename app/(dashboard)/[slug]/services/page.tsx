'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks/use-services'
import { useSalon } from '@/hooks/use-salon'
import { AddonsEditor } from '@/components/services/addons-editor'
import { BulkAddonDialog } from '@/components/services/bulk-addon-dialog'
import { AssignEmployeesModal } from '@/components/services/assign-employees-modal'
import { ServiceMediaGallery } from '@/components/services/service-media-gallery'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Edit,
  Trash2,
  Check,
  X,
  AlertCircle,
  Clock,
  DollarSign,
  Layers,
  ChevronRight,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Lock,
  Unlock,
  Wrench,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { EmptyState } from '@/components/ui/empty-state'
import { ListLoadingState } from '@/components/ui/list-loading-state'
import { motion, AnimatePresence } from 'framer-motion'
import { normalizeServicePriceType, ServicePriceType } from '@/lib/services/price-types'
import { ObjectCell, ObjectTrigger } from '@/components/objects'

const serviceSchema = z.object({
  category: z.string().min(2, 'Minimum 2 znaki'),
  subcategory: z.string().min(2, 'Minimum 2 znaki'),
  name: z.string().min(2, 'Minimum 2 znaki'),
  price_type: z.enum(['fixed', 'variable', 'from', 'hidden', 'free']).default('fixed'),
  price: z.number().nonnegative('Cena nie może być ujemna').optional(),
  duration: z.number().positive('Czas musi być większy od 0'),
  description: z.string().max(1000, 'Maksymalnie 1000 znaków').optional(),
}).superRefine((data, ctx) => {
  if (data.price_type === 'free') {
    return
  }

  if (data.price_type === 'variable') {
    if (data.price !== undefined && data.price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cena musi być większa od 0',
        path: ['price'],
      })
    }
    return
  }

  if (!data.price || data.price <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cena musi być większa od 0',
      path: ['price'],
    })
  }
})

type ServiceFormData = z.infer<typeof serviceSchema>

interface Service {
  id: string
  name: string
  price: number
  price_type: ServicePriceType
  duration: number
  surchargeAllowed: boolean
  category?: string
  subcategory?: string
  active: boolean
  description?: string
}

const normalizePriceType = (value?: string): ServiceFormData['price_type'] =>
  normalizeServicePriceType(value)

export default function ServicesPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [activeTab, setActiveTab] = useState('profil')
  const [employeeModalService, setEmployeeModalService] = useState<{ id: string; name: string } | null>(null)
  const [availableEquipment, setAvailableEquipment] = useState<{ id: string; name: string; type: string }[]>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isBulkApplying, setIsBulkApplying] = useState(false)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [bulkAddonDialog, setBulkAddonDialog] = useState<{ open: boolean; mode: 'assign' | 'remove' }>({ open: false, mode: 'assign' })
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('')

  const { data: servicesData, isLoading } = useServices()
  const { data: salonData } = useSalon(slug)
  const salonId = salonData?.salon?.id ?? ''
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  // Load all active equipment once for assignment UI
  useEffect(() => {
    fetch('/api/equipment')
      .then(r => r.json())
      .then(d => setAvailableEquipment(d.equipment ?? []))
      .catch(() => {})
  }, [])

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      category: '',
      subcategory: '',
      name: '',
      price_type: 'fixed',
      price: 0,
      duration: 30,
    },
    mode: 'onChange',
  })
  const selectedPriceType = form.watch('price_type')
  const isFreePriceType = selectedPriceType === 'free'
  const isVariablePriceType = selectedPriceType === 'variable'
  const priceLabel = selectedPriceType === 'from' || selectedPriceType === 'variable' ? 'Cena od' : 'Cena'

  useEffect(() => {
    if (selectedPriceType === 'free') {
      form.setValue('price', 0, { shouldDirty: true, shouldValidate: true })
    }
  }, [form, selectedPriceType])

  useEffect(() => {
    const action = searchParams.get('action')
    if (action !== 'new-service') {
      return
    }

    handleOpenDialog()
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('action')
    const nextUrl = nextParams.toString() ? `/${slug}/services?${nextParams.toString()}` : `/${slug}/services`
    router.replace(nextUrl, { scroll: false })
  }, [router, searchParams, slug])

  // Flatten and filter services
  const { allServices, categories, stats } = useMemo(() => {
    const list: Service[] = []
    const cats = new Set<string>()
    let totalServices = 0
    let totalVisiblePrice = 0
    let totalVisiblePriceCount = 0
    let totalDuration = 0

    if (servicesData) {
      servicesData.forEach((categoryGroup) => {
        cats.add(categoryGroup.category)
        categoryGroup.subcategories.forEach((subcategoryGroup) => {
          subcategoryGroup.services.forEach((service: any) => {
            const flattened: Service = {
              ...service,
              price_type: normalizePriceType(service.price_type),
              category: categoryGroup.category,
              subcategory: subcategoryGroup.name,
              active: service.active ?? true,
            }
            list.push(flattened)
            totalServices++
            totalDuration += service.duration
            if (flattened.price_type !== 'free' && flattened.price_type !== 'hidden') {
              totalVisiblePrice += flattened.price
              totalVisiblePriceCount++
            }
          })
        })
      })
    }

    return {
      allServices: list,
      categories: Array.from(cats),
      stats: {
        total: totalServices,
        avgPrice: totalVisiblePriceCount > 0 ? totalVisiblePrice / totalVisiblePriceCount : 0,
        avgDuration: totalServices > 0 ? totalDuration / totalServices : 0
      }
    }
  }, [servicesData])

  const filteredServices = useMemo(() => {
    return allServices.filter((service) => {
      const matchesSearch =
        service.name.toLowerCase().includes(search.toLowerCase()) ||
        (service.category && service.category.toLowerCase().includes(search.toLowerCase())) ||
        (service.subcategory && service.subcategory.toLowerCase().includes(search.toLowerCase()))

      const matchesCategory = activeCategory === 'all' || service.category === activeCategory

      return matchesSearch && matchesCategory
    })
  }, [allServices, search, activeCategory])

  useEffect(() => {
    if (selectedServiceIds.length === 0) return
    const validIds = new Set(allServices.map((service) => service.id))
    setSelectedServiceIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [allServices, selectedServiceIds.length])

  const selectedServices = useMemo(
    () => allServices.filter((service) => selectedServiceIds.includes(service.id)),
    [allServices, selectedServiceIds]
  )

  const selectedVisibleCount = useMemo(
    () => filteredServices.filter((service) => selectedServiceIds.includes(service.id)).length,
    [filteredServices, selectedServiceIds]
  )

  const selectedStats = useMemo(() => {
    return selectedServices.reduce(
      (acc, service) => {
        if (service.active) {
          acc.active += 1
        } else {
          acc.inactive += 1
        }
        return acc
      },
      { active: 0, inactive: 0 }
    )
  }, [selectedServices])

  // Group filtered services by category/subcategory for display
  const groupedDisplay = useMemo(() => {
    const grouped = new Map<string, Record<string, Service[]>>()

    filteredServices.forEach((service) => {
      const cat = service.category?.trim() || 'Inne'
      const subcat = service.subcategory?.trim() || 'Inne'

      if (!grouped.has(cat)) {
        grouped.set(cat, {})
      }

      const categoryGroup = grouped.get(cat)!
      if (!categoryGroup[subcat]) {
        categoryGroup[subcat] = []
      }
      categoryGroup[subcat].push(service)
    })

    const entries = Array.from(grouped.entries())
    const otherIndex = entries.findIndex(([category]) => category === 'Inne')
    if (otherIndex > -1) {
      const [other] = entries.splice(otherIndex, 1)
      entries.push(other)
    }

    return entries
  }, [filteredServices])

  const defaultExpandedCategory = groupedDisplay[0]?.[0]
  const handleOpenDialog = (service?: Service) => {
    setActiveTab('profil')
    if (service) {
      setEditingService(service)
      form.reset({
        category: service.category || '',
        subcategory: service.subcategory || '',
        name: service.name,
        price_type: normalizePriceType(service.price_type),
        price: service.price,
        duration: service.duration,
        description: service.description || '',
      })
      fetch(`/api/services/${service.id}/equipment`)
        .then(r => r.json())
        .then(d => setSelectedEquipmentIds((d.equipment ?? []).map((e: any) => e.id)))
        .catch(() => setSelectedEquipmentIds([]))
    } else {
      setEditingService(null)
      setSelectedEquipmentIds([])
      form.reset({
        category: activeCategory !== 'all' ? activeCategory : '',
        subcategory: '',
        name: '',
        price_type: 'fixed',
        price: 0,
        duration: 30,
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingService(null)
    setActiveTab('profil')
    setEmployeeModalService(null)
    setSelectedEquipmentIds([])
    form.reset()
  }

  const saveEquipmentAssignment = async (serviceId: string) => {
    await fetch(`/api/services/${serviceId}/equipment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipment_ids: selectedEquipmentIds }),
    })
  }

  const onSubmit = async (data: ServiceFormData) => {
    try {
      const normalizedPriceType = normalizePriceType(data.price_type)
      const normalizedPrice =
        normalizedPriceType === 'free'
          ? 0
          : data.price ?? 0
      const serviceData = {
        ...data,
        price_type: normalizedPriceType,
        price: normalizedPrice,
        active: editingService ? editingService.active : true,
      }

      if (editingService) {
        await updateService.mutateAsync({
          id: editingService.id,
          ...serviceData,
        })
        await saveEquipmentAssignment(editingService.id)
        toast.success('Usługa zaktualizowana')
        handleCloseDialog()
      } else {
        const result = await createService.mutateAsync(serviceData)
        const newServiceId = result?.service?.id
        if (newServiceId) {
          await saveEquipmentAssignment(newServiceId)
        }
        toast.success('Usługa dodana')
        setEditingService(result.service)
        setActiveTab('dodatki')
        setEmployeeModalService({ id: result.service.id, name: result.service.name })
      }
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas zapisywania')
    }
  }

  const handleDelete = async (service: Service) => {
    const confirmToken = 'USUN 1'
    const confirmation = window.prompt(
      `Usuwasz 1 usługę: "${service.name}".\nWpisz "${confirmToken}", aby potwierdzić.`,
      ''
    )

    if (confirmation !== confirmToken) {
      return
    }

    try {
      await deleteService.mutateAsync(service.id)
      toast.success('Usługa usunięta')
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas usuwania')
    }
  }

  const handleToggleActive = async (service: Service) => {
    try {
      await updateService.mutateAsync({
        id: service.id,
        active: !service.active,
      })
      toast.success(service.active ? 'Usługa dezaktywowana' : 'Usługa aktywowana')
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas zmiany statusu')
    }
  }

  const toggleServiceSelection = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    )
  }

  const selectAllVisible = () => {
    setSelectedServiceIds((prev) => {
      const visibleIds = filteredServices.map((service) => service.id)
      const merged = new Set([...prev, ...visibleIds])
      return Array.from(merged)
    })
  }

  const clearSelection = () => {
    setSelectedServiceIds([])
  }

  const refreshServices = async () => {
    window.dispatchEvent(new Event('focus'))
  }

  const applyBulkStatus = async (action: 'activate' | 'deactivate', ids = selectedServiceIds, enableUndo = true) => {
    if (ids.length === 0) return

    setIsBulkApplying(true)
    try {
      const response = await fetch('/api/services/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Nie udało się zaktualizować statusu usług')
      }

      const updatedCount = payload?.updated_count ?? ids.length
      toast.success(
        action === 'activate'
          ? `Aktywowano ${updatedCount} usług`
          : `Dezaktywowano ${updatedCount} usług`,
        enableUndo
          ? {
              action: {
                label: 'Cofnij',
                onClick: () => {
                  void applyBulkStatus(action === 'activate' ? 'deactivate' : 'activate', ids, false)
                },
              },
            }
          : undefined
      )

      setSelectedServiceIds((prev) => prev.filter((id) => !ids.includes(id)))
      await refreshServices()
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas aktualizacji statusu')
    } finally {
      setIsBulkApplying(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedServiceIds.length === 0) return

    setIsBulkApplying(true)
    try {
      const response = await fetch('/api/services/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedServiceIds }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Nie udało się usunąć usług')
      }

      const deletedCount = payload?.deleted_count ?? selectedServiceIds.length
      toast.success(`Usunięto ${deletedCount} usług`)
      setSelectedServiceIds([])
      setIsBulkDeleteDialogOpen(false)
      setBulkDeleteConfirmText('')
      await refreshServices()
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas usuwania usług')
    } finally {
      setIsBulkApplying(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  const getServicePriceDisplay = (service: Service): { text: string; showHiddenBadge: boolean } => {
    const servicePriceType = normalizePriceType(service.price_type)
    const hasPrice = typeof service.price === 'number' && service.price > 0

    if (servicePriceType === 'free') {
      return { text: 'Bezplatna', showHiddenBadge: false }
    }

    if (servicePriceType === 'variable') {
      if (hasPrice) {
        return { text: `od ${formatPrice(service.price)} (zmienna)`, showHiddenBadge: false }
      }
      return { text: 'Cena zmienna', showHiddenBadge: false }
    }

    if (servicePriceType === 'from') {
      return { text: `od ${formatPrice(service.price)}`, showHiddenBadge: false }
    }

    if (servicePriceType === 'hidden') {
      return { text: formatPrice(service.price), showHiddenBadge: true }
    }

    return { text: formatPrice(service.price), showHiddenBadge: false }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 pb-10 sm:px-0">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Usługi
          </h1>
          <p className="text-muted-foreground text-base font-medium theme-header-subtitle">Zarządzaj ofertą swojego salonu</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-5 rounded-xl font-semibold hidden sm:inline-flex"
            onClick={() => router.push(`/${slug}/services/addon-templates`)}
          >
            <Wrench className="h-4 w-4 mr-2" />
            Szablony dodatków
          </Button>
          <Button
            size="lg"
            className="gradient-button shadow-lg shadow-primary/20 h-12 px-6 rounded-xl font-bold hidden sm:inline-flex"
            onClick={() => handleOpenDialog()}
          >
            <Plus className="h-5 w-5 mr-2" />
            Dodaj usługę
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wider">Usługi</p>
            <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          </div>
        </Card>
        <Card className="relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wider">Śr. Cena</p>
            <p className="text-2xl font-black text-gray-900">{formatPrice(stats.avgPrice)}</p>
          </div>
        </Card>
        <Card className="relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-400 uppercase tracking-wider">Śr. Czas</p>
            <p className="text-2xl font-black text-gray-900">{Math.round(stats.avgDuration)} min</p>
          </div>
        </Card>
      </div>

      {/* Search & Categories */}
      <Card className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj usługi, kategorii lub podkategorii..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-full border-slate-300 bg-white pl-12 text-sm transition-all focus-visible:ring-2 focus-visible:ring-emerald-600/25"
          />
        </div>
        <div className="flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            className="h-8 rounded-full px-4 text-xs"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Kafelki
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            className="h-8 rounded-full px-4 text-xs"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-1.5" />
            Lista
          </Button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-nowrap pb-2 -mx-1 px-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 min-h-[44px] min-w-[44px] shrink-0",
              activeCategory === 'all'
                ? "bg-primary text-white shadow-lg shadow-primary/20 translate-y-[-1px]"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 font-semibold"
            )}
          >
            Wszystkie
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs",
              activeCategory === 'all' ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
            )}>
              {allServices.length}
            </span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 min-h-[44px] min-w-[44px] shrink-0",
                activeCategory === cat
                  ? "bg-primary text-white shadow-lg shadow-primary/20 translate-y-[-1px]"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 font-semibold"
              )}
            >
              {cat}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-sm",
                activeCategory === cat ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              )}>
                {allServices.filter(s => s.category === cat).length}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {selectedServiceIds.length > 0 && (
        <Card className="p-4 border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-900">
                Zaznaczono {selectedServiceIds.length} usług (widoczne: {selectedVisibleCount})
              </p>
              <p className="text-xs text-amber-800">
                W selekcji: {selectedStats.active} aktywnych, {selectedStats.inactive} nieaktywnych.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={selectAllVisible} className="h-11 px-3 min-h-[44px] min-w-[44px]">
                Zaznacz widoczne ({filteredServices.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-3 min-h-[44px] min-w-[44px]"
                onClick={() => applyBulkStatus('activate')}
                disabled={isBulkApplying}
              >
                Aktywuj
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-3 min-h-[44px] min-w-[44px]"
                onClick={() => applyBulkStatus('deactivate')}
                disabled={isBulkApplying}
              >
                Dezaktywuj
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-3 min-h-[44px] min-w-[44px]"
                onClick={() => setBulkAddonDialog({ open: true, mode: 'assign' })}
                disabled={isBulkApplying}
              >
                Przypisz dodatki
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-11 px-3 min-h-[44px] min-w-[44px]"
                onClick={() => setBulkAddonDialog({ open: true, mode: 'remove' })}
                disabled={isBulkApplying}
              >
                Usuń dodatki
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-11 px-3 min-h-[44px] min-w-[44px]"
                onClick={() => setIsBulkDeleteDialogOpen(true)}
                disabled={isBulkApplying}
              >
                Usuń zaznaczone
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} className="h-11 px-3 min-h-[44px] min-w-[44px]">
                Wyczyść
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Services List */}
      {isLoading ? (
        <ListLoadingState rows={6} />
      ) : groupedDisplay.length > 0 ? (
        <motion.div
          className="space-y-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <Accordion
            type="multiple"
            defaultValue={defaultExpandedCategory ? [defaultExpandedCategory] : []}
            className="space-y-4"
          >
            <AnimatePresence mode="popLayout">
              {groupedDisplay.map(([category, subcategories]) => {
                const categoryCount = Object.values(subcategories).reduce(
                  (sum, services) => sum + services.length,
                  0
                )

                return (
                  <motion.div key={category} layout variants={itemVariants}>
                    <AccordionItem value={category} className="rounded-2xl border border-slate-200 bg-white px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-1 bg-primary rounded-full" />
                          <span className="text-2xl font-black text-foreground tracking-tight">{category}</span>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold text-sm">
                            {categoryCount}
                          </Badge>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pt-2 pb-4">
                        <div className="grid gap-8">
                          {Object.entries(subcategories).map(([subcategory, services]) => (
                            <div key={subcategory} className="space-y-4">
                              <div className="flex items-center justify-between px-2">
                                <h3 className="text-lg font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                  <ChevronRight className="h-4 w-4 text-primary/60" />
                                  {subcategory}
                                </h3>
                                <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold text-sm">
                                  {services.length} {services.length === 1 ? 'usługa' : 'usługi'}
                                </Badge>
                              </div>

                              <div className={cn(
                                viewMode === 'grid'
                                  ? "grid grid-cols-1 xl:grid-cols-2 gap-4"
                                  : "space-y-2"
                              )}>
                                {(services as Service[]).map((service) => {
                                  const priceDisplay = getServicePriceDisplay(service)
                                  const objectMeta = priceDisplay.showHiddenBadge
                                    ? `${service.duration} min`
                                    : `${service.duration} min • ${priceDisplay.text}`
                                  return (
                                  <Card
                                    key={service.id}
                                    className={cn(
                                      viewMode === 'grid'
                                        ? "group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 transition-all hover:shadow-md"
                                        : "group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition-all hover:shadow-md",
                                      !service.active && "opacity-60 bg-gray-50/50"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="space-y-2 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedServiceIds.includes(service.id)}
                                            onChange={() => toggleServiceSelection(service.id)}
                                            className="h-4 w-4 rounded accent-primary"
                                          aria-label={`Zaznacz usługę ${service.name}`}
                                          />
                                          <ObjectCell
                                            type="service"
                                            id={service.id}
                                            label={service.name}
                                            slug={slug}
                                            meta={objectMeta}
                                            showActions={false}
                                            className="max-w-[240px] sm:max-w-[320px]"
                                          />
                                          {!service.active && (
                                            <Badge variant="outline" className="bg-white text-gray-400 border-gray-200 font-bold text-xs uppercase">
                                              Nieaktywna
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-gray-500 font-medium">
                                          <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                                            <DollarSign className="h-4 w-4" />
                                            {priceDisplay.text}
                                            {priceDisplay.showHiddenBadge ? (
                                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                                Ukryta
                                              </Badge>
                                            ) : null}
                                          </span>
                                          <span className="flex items-center gap-1.5">
                                            <Clock className="h-4 w-4 text-gray-400" />
                                            {service.duration} min
                                          </span>
                                        </div>
                                      </div>

                                      <div className={cn(
                                        "flex items-center gap-1 transition-opacity",
                                        viewMode === 'grid'
                                          ? "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                                          : "opacity-100"
                                      )}>
                                        <ObjectTrigger
                                          type="service"
                                          id={service.id}
                                          label={service.name}
                                          slug={slug}
                                          meta={service.category}
                                        />
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className={cn(
                                            "h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg transition-colors",
                                            service.active ? "text-slate-400 hover:text-amber-500 hover:bg-amber-50" : "text-slate-400 hover:text-emerald-500 hover:bg-emerald-50"
                                          )}
                                          onClick={() => handleToggleActive(service)}
                                          title={service.active ? 'Dezaktywuj' : 'Aktywuj'}
                                        >
                                          {service.active ? (
                                            <Lock className="h-4 w-4" />
                                          ) : (
                                            <Unlock className="h-4 w-4" />
                                          )}
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5"
                                          onClick={() => handleOpenDialog(service)}
                                          title="Edytuj"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                          onClick={() => handleDelete(service)}
                                          title="Usuń"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </Card>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </Accordion>
        </motion.div>
      ) : (
        <EmptyState
          icon={search || activeCategory !== 'all' ? Search : Sparkles}
          title={search || activeCategory !== 'all' ? 'Nie znaleziono usług' : 'Brak usług w ofercie'}
          description={search || activeCategory !== 'all'
            ? 'Spróbuj zmienić parametry wyszukiwania lub kategorię.'
            : 'W Twoim salonie nie ma jeszcze żadnych usług. Dodaj pierwszą usługę, aby klienci mogli się zapisywać!'}
          actionLabel={search || activeCategory !== 'all' ? 'Wyczyść filtry' : 'Dodaj pierwszą usługę'}
          onAction={search || activeCategory !== 'all'
            ? () => { setSearch(''); setActiveCategory('all'); }
            : () => handleOpenDialog()}
        />
      )}

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto rounded-2xl border border-slate-200 bg-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text text-2xl">
              {editingService ? 'Edytuj usługę' : 'Nowa usługa'}
            </DialogTitle>
            <DialogDescription>
              Wypełnij parametry usługi, aby zaktualizować ofertę salonu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-1">
              <TabsList className="mb-4">
                <TabsTrigger value="profil">Profil</TabsTrigger>
                <TabsTrigger value="dodatki">Dodatki</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
              </TabsList>

              <TabsContent value="profil" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category" className="font-bold text-gray-700">Kategoria *</Label>
                  <div className="relative">
                    <Input id="category" placeholder="np. Fryzjerstwo" {...form.register('category')} className="glass h-11 py-3 rounded-xl focus:bg-white" />
                    <Layers className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  </div>
                  {form.formState.errors.category && (
                    <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.category.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subcategory" className="font-bold text-gray-700">Podkategoria *</Label>
                  <div className="relative">
                    <Input id="subcategory" placeholder="np. Strzyżenie" {...form.register('subcategory')} className="glass h-11 py-3 rounded-xl focus:bg-white" />
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  </div>
                  {form.formState.errors.subcategory && (
                    <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.subcategory.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="font-bold text-gray-700">Nazwa usługi *</Label>
                  <Input id="name" placeholder="np. Strzyżenie damskie" {...form.register('name')} className="glass h-11 py-3 rounded-xl focus:bg-white" />
                  {form.formState.errors.name && (
                    <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="font-bold text-gray-700">Opis usługi</Label>
                  <Textarea
                    id="description"
                    placeholder="Krótki opis usługi widoczny dla klientów podczas rezerwacji..."
                    maxLength={1000}
                    rows={3}
                    {...form.register('description')}
                    className="glass rounded-xl focus:bg-white resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">{(form.watch('description') ?? '').length}/1000</p>
                  {form.formState.errors.description && (
                    <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.description.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="price_type" className="font-bold text-gray-700">Typ ceny *</Label>
                    <Select
                      value={selectedPriceType}
                      onValueChange={(value) => form.setValue('price_type', value as ServiceFormData['price_type'], { shouldDirty: true, shouldValidate: true })}
                    >
                      <SelectTrigger id="price_type" className="glass h-11 py-3 rounded-xl focus:bg-white">
                        <SelectValue placeholder="Wybierz typ ceny" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Stala</SelectItem>
                        <SelectItem value="variable">Zmienna</SelectItem>
                        <SelectItem value="from">Od kwoty</SelectItem>
                        <SelectItem value="hidden">Ukryta</SelectItem>
                        <SelectItem value="free">Bezplatna</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {!isFreePriceType ? (
                  <div className="space-y-2">
                    <Label htmlFor="price" className="font-bold text-gray-700">
                      {priceLabel} {isVariablePriceType ? '' : '*'}
                    </Label>
                    <div className="relative">
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...form.register('price', {
                          setValueAs: (value) => value === '' ? undefined : Number(value),
                        })}
                        className="glass h-11 py-3 rounded-xl focus:bg-white pr-10"
                      />
                      <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    </div>
                    {form.formState.errors.price && (
                      <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.price.message}
                      </p>
                    )}
                  </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="duration" className="font-bold text-gray-700">Czas (min) *</Label>
                    <div className="relative">
                      <Input id="duration" type="number" step="5" placeholder="30" {...form.register('duration', { valueAsNumber: true })} className="glass h-11 py-3 rounded-xl focus:bg-white pr-10" />
                      <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    </div>
                    {form.formState.errors.duration && (
                      <p className="text-sm text-rose-600 font-bold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.duration.message}
                      </p>
                    )}
                  </div>
                </div>

                {availableEquipment.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-bold text-gray-700 flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Wymagany sprzęt
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableEquipment.map(eq => (
                        <label key={eq.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedEquipmentIds.includes(eq.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEquipmentIds(prev => [...prev, eq.id])
                              } else {
                                setSelectedEquipmentIds(prev => prev.filter(id => id !== eq.id))
                              }
                            }}
                            className="h-4 w-4 rounded accent-primary"
                          />
                          <span className="text-sm font-medium truncate">{eq.name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedEquipmentIds.length > 0 && (
                      <p className="text-sm text-muted-foreground">Rezerwacja sprzętu będzie sprawdzana przy każdej nowej wizycie.</p>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="dodatki" className="space-y-2">
                {editingService ? (
                  <AddonsEditor serviceId={editingService.id} salonId={salonId} />
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Najpierw zapisz usługę, aby zarządzać dodatkami.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="media" className="space-y-2">
                {editingService ? (
                  <>
                    <Label className="font-bold text-gray-700">Zdjęcia usługi</Label>
                    <ServiceMediaGallery serviceId={editingService.id} />
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Najpierw zapisz usługę, aby dodawać media.
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={handleCloseDialog} className="rounded-xl font-bold h-11 px-3 min-h-[44px] min-w-[44px]">
                Anuluj
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="gradient-button rounded-xl font-bold flex-1 h-11 px-3 min-h-[44px] min-w-[44px]">
                {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {form.formState.isSubmitting ? 'Zapisywanie...' : editingService ? 'Zapisz zmiany' : 'Dodaj usługę'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Potwierdź usunięcie usług</DialogTitle>
            <DialogDescription>
              Usuniesz {selectedServiceIds.length} usług. Tej operacji nie można cofnąć.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-delete-services-confirm">
              Wpisz <strong>{`USUN ${selectedServiceIds.length}`}</strong>, aby potwierdzić
            </Label>
            <Input
              id="bulk-delete-services-confirm"
              value={bulkDeleteConfirmText}
              onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
              placeholder={`USUN ${selectedServiceIds.length}`}
              className="py-3 min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              W selekcji: {selectedStats.active} aktywnych i {selectedStats.inactive} nieaktywnych.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3 min-h-[44px] min-w-[44px]"
              onClick={() => {
                setIsBulkDeleteDialogOpen(false)
                setBulkDeleteConfirmText('')
              }}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 px-3 min-h-[44px] min-w-[44px]"
              disabled={bulkDeleteConfirmText !== `USUN ${selectedServiceIds.length}` || isBulkApplying}
              onClick={handleBulkDelete}
            >
              Usuń na stałe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssignEmployeesModal
        serviceId={employeeModalService?.id ?? ''}
        serviceName={employeeModalService?.name ?? ''}
        isOpen={employeeModalService !== null}
        onClose={() => setEmployeeModalService(null)}
      />
      <BulkAddonDialog
        serviceIds={selectedServiceIds}
        mode={bulkAddonDialog.mode}
        open={bulkAddonDialog.open}
        onClose={() => setBulkAddonDialog((prev) => ({ ...prev, open: false }))}
        onSuccess={() => {
          setBulkAddonDialog((prev) => ({ ...prev, open: false }))
          clearSelection()
        }}
      />
      <Button
        type="button"
        size="icon"
        onClick={() => handleOpenDialog()}
        className="fixed bottom-5 right-5 z-40 h-11 w-11 min-h-[44px] min-w-[44px] rounded-full shadow-lg shadow-primary/25 gradient-button sm:hidden"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  )
}
