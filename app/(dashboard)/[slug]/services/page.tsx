'use client'

import { useState } from 'react'
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
import { Plus, Search, Edit, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface Service {
  id: string
  name: string
  price: number
  duration: number
  surchargeAllowed: boolean
  category?: string
  subcategory?: string
  active?: boolean
}

export default function ServicesPage() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState({
    category: '',
    subcategory: '',
    name: '',
    price: '',
    duration: '',
  })

  const { data: servicesData, isLoading } = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  // Flatten grouped services for display
  const allServices: Service[] = []
  if (servicesData) {
    servicesData.forEach((categoryGroup) => {
      categoryGroup.subcategories.forEach((subcategoryGroup) => {
        subcategoryGroup.services.forEach((service) => {
          allServices.push({
            ...service,
            category: categoryGroup.category,
            subcategory: subcategoryGroup.name,
            active: true, // Assuming active since we only fetch active services
          })
        })
      })
    })
  }

  const filteredServices = allServices.filter(
    (service) =>
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      (service.category && service.category.toLowerCase().includes(search.toLowerCase())) ||
      (service.subcategory && service.subcategory.toLowerCase().includes(search.toLowerCase()))
  )

  const handleOpenDialog = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setFormData({
        category: service.category || '',
        subcategory: service.subcategory || '',
        name: service.name,
        price: service.price.toString(),
        duration: service.duration.toString(),
      })
    } else {
      setEditingService(null)
      setFormData({
        category: '',
        subcategory: '',
        name: '',
        price: '',
        duration: '',
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingService(null)
    setFormData({
      category: '',
      subcategory: '',
      name: '',
      price: '',
      duration: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const serviceData = {
      category: formData.category.trim(),
      subcategory: formData.subcategory.trim(),
      name: formData.name.trim(),
      price: parseFloat(formData.price),
      duration: parseInt(formData.duration),
      active: true,
    }

    if (!serviceData.name || !serviceData.category || !serviceData.subcategory) {
      toast.error('Wypełnij wszystkie wymagane pola')
      return
    }

    if (serviceData.price <= 0) {
      toast.error('Cena musi być większa od 0')
      return
    }

    if (serviceData.duration <= 0) {
      toast.error('Czas trwania musi być większy od 0')
      return
    }

    try {
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
        active: !(service.active ?? true),
      })
      toast.success(service.active ? 'Usługa dezaktywowana' : 'Usługa aktywowana')
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas zmiany statusu')
    }
  }

  // Group services by category for display
  const groupedServices: Record<string, Record<string, Service[]>> = {}
  filteredServices.forEach((service) => {
    const cat = service.category || 'Inne'
    const subcat = service.subcategory || 'Inne'
    
    if (!groupedServices[cat]) {
      groupedServices[cat] = {}
    }
    if (!groupedServices[cat][subcat]) {
      groupedServices[cat][subcat] = []
    }
    groupedServices[cat][subcat].push(service)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usługi</h1>
          <p className="mt-2 text-gray-600">Zarządzaj usługami oferowanymi w salonie</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj usługę
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj usługi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Ładowanie...</p>
        </div>
      ) : Object.keys(groupedServices).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedServices).map(([category, subcategories]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-xl">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(subcategories).map(([subcategory, services]) => (
                  <div key={subcategory}>
                    <h3 className="font-semibold text-gray-700 mb-2">{subcategory}</h3>
                    <div className="space-y-2">
                      {services.map((service) => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{service.name}</p>
                              {!service.active && (
                                <Badge variant="secondary" className="bg-gray-200">
                                  Nieaktywna
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              {service.price.toFixed(2)} zł • {service.duration} min
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleActive(service)}
                              title={service.active ? 'Dezaktywuj' : 'Aktywuj'}
                            >
                              {service.active ? (
                                <X className="h-4 w-4 text-red-600" />
                              ) : (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(service)}
                              title="Edytuj"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(service)}
                              title="Usuń"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600">
              {search ? 'Brak wyników' : 'Brak usług. Dodaj pierwszą usługę!'}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? 'Edytuj usługę' : 'Dodaj nową usługę'}
            </DialogTitle>
            <DialogDescription>
              Wypełnij informacje o usłudze
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category">Kategoria *</Label>
                <Input
                  id="category"
                  placeholder="np. Fryzjerstwo"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subcategory">Podkategoria *</Label>
                <Input
                  id="subcategory"
                  placeholder="np. Strzyżenie"
                  value={formData.subcategory}
                  onChange={(e) =>
                    setFormData({ ...formData, subcategory: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nazwa usługi *</Label>
                <Input
                  id="name"
                  placeholder="np. Strzyżenie damskie"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Cena (zł) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Czas (min) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    step="15"
                    min="15"
                    placeholder="60"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Anuluj
              </Button>
              <Button type="submit">
                {editingService ? 'Zapisz zmiany' : 'Dodaj usługę'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}