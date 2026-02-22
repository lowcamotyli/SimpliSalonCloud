'use client'

import { useState, useMemo } from 'react'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '@/hooks/use-services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  Unlock
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils/cn'
import { EmptyState } from '@/components/ui/empty-state'
import { motion, AnimatePresence } from 'framer-motion'

const serviceSchema = z.object({
  category: z.string().min(2, 'Minimum 2 znaki'),
  subcategory: z.string().min(2, 'Minimum 2 znaki'),
  name: z.string().min(2, 'Minimum 2 znaki'),
  price: z.number().positive('Cena musi być większa od 0'),
  duration: z.number().positive('Czas musi być większy od 0'),
})

type ServiceFormData = z.infer<typeof serviceSchema>

interface Service {
  id: string
  name: string
  price: number
  duration: number
  surchargeAllowed: boolean
  category?: string
  subcategory?: string
  active: boolean
}

export default function ServicesPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)

  const { data: servicesData, isLoading } = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      category: '',
      subcategory: '',
      name: '',
      price: 0,
      duration: 30,
    },
    mode: 'onChange',
  })

  // Flatten and filter services
  const { allServices, categories, stats } = useMemo(() => {
    const list: Service[] = []
    const cats = new Set<string>()
    let totalServices = 0
    let totalPrice = 0
    let totalDuration = 0

    if (servicesData) {
      servicesData.forEach((categoryGroup) => {
        cats.add(categoryGroup.category)
        categoryGroup.subcategories.forEach((subcategoryGroup) => {
          subcategoryGroup.services.forEach((service: any) => {
            const flattened: Service = {
              ...service,
              category: categoryGroup.category,
              subcategory: subcategoryGroup.name,
              active: service.active ?? true,
            }
            list.push(flattened)
            totalServices++
            totalPrice += service.price
            totalDuration += service.duration
          })
        })
      })
    }

    return {
      allServices: list,
      categories: Array.from(cats),
      stats: {
        total: totalServices,
        avgPrice: totalServices > 0 ? totalPrice / totalServices : 0,
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

  // Group filtered services for display
  const groupedDisplay = useMemo(() => {
    const grouped: Record<string, Record<string, Service[]>> = {}
    filteredServices.forEach((service) => {
      const cat = service.category || 'Inne'
      const subcat = service.subcategory || 'Inne'

      if (!grouped[cat]) grouped[cat] = {}
      if (!grouped[cat][subcat]) grouped[cat][subcat] = []
      grouped[cat][subcat].push(service)
    })
    return grouped
  }, [filteredServices])
  const handleOpenDialog = (service?: Service) => {
    if (service) {
      setEditingService(service)
      form.reset({
        category: service.category || '',
        subcategory: service.subcategory || '',
        name: service.name,
        price: service.price,
        duration: service.duration,
      })
    } else {
      setEditingService(null)
      form.reset({
        category: activeCategory !== 'all' ? activeCategory : '',
        subcategory: '',
        name: '',
        price: 0,
        duration: 30,
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingService(null)
    form.reset()
  }

  const onSubmit = async (data: ServiceFormData) => {
    try {
      const serviceData = {
        ...data,
        active: editingService ? editingService.active : true,
      }

      if (editingService) {
        await updateService.mutateAsync({
          id: editingService.id,
          ...serviceData,
        })
        toast.success('Usługa zaktualizowana')
      } else {
        await createService.mutateAsync(serviceData)
        toast.success('Usługa dodana')
      }
      handleCloseDialog()
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas zapisywania')
    }
  }

  const handleDelete = async (service: Service) => {
    if (!confirm(`Czy na pewno chcesz usunąć usługę "${service.name}"?`)) {
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

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Usługi
          </h1>
          <p className="text-muted-foreground text-base font-medium">Zarządzaj ofertą swojego salonu</p>
        </div>
        <Button
          size="lg"
          className="gradient-button shadow-lg shadow-primary/20 h-12 px-6 rounded-xl font-bold"
          onClick={() => handleOpenDialog()}
        >
          <Plus className="h-5 w-5 mr-2" />
          Dodaj usługę
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Usługi</p>
            <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Śr. Cena</p>
            <p className="text-2xl font-black text-gray-900">{formatPrice(stats.avgPrice)}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Śr. Czas</p>
            <p className="text-2xl font-black text-gray-900">{Math.round(stats.avgDuration)} min</p>
          </div>
        </Card>
      </div>

      {/* Search & Categories */}
      <Card className="p-6 glass border-none shadow-xl shadow-slate-200/50 space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj usługi, kategorii lub podkategorii..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 bg-white/50 border-gray-200/50 focus:bg-white transition-all text-base rounded-xl"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2",
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
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2",
                activeCategory === cat
                  ? "bg-primary text-white shadow-lg shadow-primary/20 translate-y-[-1px]"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 font-semibold"
              )}
            >
              {cat}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                activeCategory === cat ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              )}>
                {allServices.filter(s => s.category === cat).length}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Services List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="h-12 w-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Ładowanie usług...</p>
        </div>
      ) : Object.keys(groupedDisplay).length > 0 ? (
        <motion.div
          className="space-y-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {Object.entries(groupedDisplay).map(([category, subcategories]) => (
              <motion.div key={category} layout variants={itemVariants} className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-primary rounded-full" />
                  <h2 className="text-2xl font-black text-foreground tracking-tight">{category}</h2>
                </div>

                <div className="grid gap-8">
                  {Object.entries(subcategories).map(([subcategory, services]) => (
                    <div key={subcategory} className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-primary/60" />
                          {subcategory}
                        </h3>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold">
                          {services.length} {services.length === 1 ? 'usługa' : 'usługi'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {(services as Service[]).map((service) => (
                          <Card
                            key={service.id}
                            className={cn(
                              "group relative overflow-hidden p-5 transition-all border-none bg-white hover:shadow-2xl hover:shadow-primary/10",
                              !service.active && "opacity-60 bg-gray-50/50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-2 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                    {service.name}
                                  </h4>
                                  {!service.active && (
                                    <Badge variant="outline" className="bg-white text-gray-400 border-gray-200 font-bold text-[10px] uppercase">
                                      Nieaktywna
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 font-medium">
                                  <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                                    <DollarSign className="h-3.5 w-3.5" />
                                    {formatPrice(service.price)}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                                    {service.duration} min
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className={cn(
                                    "h-9 w-9 rounded-lg transition-colors",
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
                                  className="h-9 w-9 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5"
                                  onClick={() => handleOpenDialog(service)}
                                  title="Edytuj"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => handleDelete(service)}
                                  title="Usuń"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
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
        <DialogContent className="max-w-md glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text text-2xl">
              {editingService ? 'Edytuj usługę' : 'Nowa usługa'}
            </DialogTitle>
            <DialogDescription>
              Wypełnij parametry usługi, aby zaktualizować ofertę salonu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="font-bold text-gray-700">Kategoria *</Label>
                <div className="relative">
                  <Input
                    id="category"
                    placeholder="np. Fryzjerstwo"
                    {...form.register('category')}
                    className="glass h-11 rounded-xl focus:bg-white"
                  />
                  <Layers className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                </div>
                {form.formState.errors.category && (
                  <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.category.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subcategory" className="font-bold text-gray-700">Podkategoria *</Label>
                <div className="relative">
                  <Input
                    id="subcategory"
                    placeholder="np. Strzyżenie"
                    {...form.register('subcategory')}
                    className="glass h-11 rounded-xl focus:bg-white"
                  />
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                </div>
                {form.formState.errors.subcategory && (
                  <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.subcategory.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="font-bold text-gray-700">Nazwa usługi *</Label>
                <Input
                  id="name"
                  placeholder="np. Strzyżenie damskie"
                  {...form.register('name')}
                  className="glass h-11 rounded-xl focus:bg-white"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price" className="font-bold text-gray-700">Cena (zł) *</Label>
                  <div className="relative">
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...form.register('price', { valueAsNumber: true })}
                      className="glass h-11 rounded-xl focus:bg-white pr-10"
                    />
                    <DollarSign className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  </div>
                  {form.formState.errors.price && (
                    <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.price.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration" className="font-bold text-gray-700">Czas (min) *</Label>
                  <div className="relative">
                    <Input
                      id="duration"
                      type="number"
                      step="5"
                      placeholder="30"
                      {...form.register('duration', { valueAsNumber: true })}
                      className="glass h-11 rounded-xl focus:bg-white pr-10"
                    />
                    <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  </div>
                  {form.formState.errors.duration && (
                    <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.duration.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={handleCloseDialog} className="rounded-xl font-bold">
                Anuluj
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="gradient-button rounded-xl font-bold flex-1">
                {editingService ? 'Zapisz zmiany' : 'Dodaj usługę'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}