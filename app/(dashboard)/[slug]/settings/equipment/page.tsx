'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Edit2, Power, PowerOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

interface Equipment {
  id: string;
  salon_id: string;
  name: string;
  type: 'laser' | 'fotel' | 'stol_manicure' | 'fotopolimeryzator' | 'inne' | 'other';
  description?: string;
  is_active: boolean;
  created_at: string;
}

interface ServiceOption {
  id: string;
  name: string;
}

const EQUIPMENT_TYPES = [
  { value: 'laser', label: 'Laser' },
  { value: 'fotel', label: 'Fotel' },
  { value: 'stol_manicure', label: 'Stol do manicure' },
  { value: 'fotopolimeryzator', label: 'Fotopolimeryzator' },
  { value: 'inne', label: 'Inne' },
  { value: 'other', label: 'Other' },
];

const flattenServicesResponse = (data: any): ServiceOption[] => {
  if (Array.isArray(data?.services)) {
    const first = data.services[0];

    // Supports grouped shape from GET /api/services:
    // { services: [{ category, subcategories: [{ name, services: [{ id, name }] }] }] }
    if (first && Array.isArray(first.subcategories)) {
      return data.services.flatMap((group: any) =>
        (group.subcategories ?? []).flatMap((subcategory: any) =>
          (subcategory.services ?? []).map((service: any) => ({
            id: service.id,
            name: service.name,
          }))
        )
      );
    }

    // Fallback if API returns a flat services array.
    return data.services.map((service: any) => ({
      id: service.id,
      name: service.name,
    }));
  }

  return [];
};

export default function EquipmentPage() {
  const { slug } = useParams();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipment | null>(null);
  const [isServicesDialogOpen, setIsServicesDialogOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [isServicesSaving, setIsServicesSaving] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [leftServiceIds, setLeftServiceIds] = useState<string[]>([]);
  const [rightServiceIds, setRightServiceIds] = useState<string[]>([]);
  const [selectedLeftIds, setSelectedLeftIds] = useState<Set<string>>(new Set());
  const [selectedRightIds, setSelectedRightIds] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: '',
    type: 'inne',
    description: '',
  });

  const fetchEquipment = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/equipment?includeInactive=true`);
      if (!response.ok) throw new Error('Failed to fetch equipment');
      const data = await response.json();
      setEquipment(data.equipment ?? []);
    } catch (error) {
      toast.error('Nie udało się pobrać listy sprzętu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  const handleOpenAddDialog = () => {
    setEditingItem(null);
    setFormData({ name: '', type: 'inne', description: '' });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (item: Equipment) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      description: item.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.length < 2) {
      toast.error('Nazwa musi mieć co najmniej 2 znaki');
      return;
    }

    try {
      setIsSubmitting(true);
      const url = editingItem ? `/api/equipment/${editingItem.id}` : '/api/equipment';
      const method = editingItem ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Operation failed');

      toast.success(editingItem ? 'Sprzęt zaktualizowany' : 'Sprzęt dodany pomyślnie');
      setIsDialogOpen(false);
      fetchEquipment();
    } catch (error) {
      toast.error('Wystąpił błąd podczas zapisywania');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (item: Equipment) => {
    try {
      const response = await fetch(`/api/equipment/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !item.is_active }),
      });

      if (!response.ok) throw new Error('Failed to toggle status');

      toast.success(item.is_active ? 'Sprzęt dezaktywowany' : 'Sprzęt aktywowany');
      fetchEquipment();
    } catch (error) {
      toast.error('Nie udało się zmienić statusu sprzętu');
    }
  };

  const getTypeLabel = (type: string) => {
    return EQUIPMENT_TYPES.find((t) => t.value === type)?.label || type;
  };

  const serviceById = React.useMemo(() => {
    const map = new Map<string, ServiceOption>();
    serviceOptions.forEach((service) => {
      map.set(service.id, service);
    });
    return map;
  }, [serviceOptions]);

  const leftServices = React.useMemo(
    () => leftServiceIds.map((id) => serviceById.get(id)).filter(Boolean) as ServiceOption[],
    [leftServiceIds, serviceById]
  );

  const rightServices = React.useMemo(
    () => rightServiceIds.map((id) => serviceById.get(id)).filter(Boolean) as ServiceOption[],
    [rightServiceIds, serviceById]
  );

  const handleOpenServicesDialog = async (item: Equipment) => {
    setSelectedEquipment(item);
    setIsServicesDialogOpen(true);
    setIsServicesLoading(true);
    setSelectedLeftIds(new Set());
    setSelectedRightIds(new Set());

    try {
      const [allServicesResponse, assignedServicesResponse] = await Promise.all([
        fetch('/api/services'),
        fetch(`/api/equipment/${item.id}/services`),
      ]);

      if (!allServicesResponse.ok || !assignedServicesResponse.ok) {
        throw new Error('Failed to fetch services');
      }

      const allServicesData = await allServicesResponse.json();
      const assignedServicesData = await assignedServicesResponse.json();

      const allServices = flattenServicesResponse(allServicesData);
      const assignedIds = new Set<string>(assignedServicesData?.serviceIds ?? []);

      const assigned = allServices.filter((service) => assignedIds.has(service.id));
      const unassigned = allServices.filter((service) => !assignedIds.has(service.id));

      setServiceOptions(allServices);
      setLeftServiceIds(unassigned.map((service) => service.id));
      setRightServiceIds(assigned.map((service) => service.id));
    } catch (error) {
      toast.error('Nie udało się pobrać przypisanych usług');
    } finally {
      setIsServicesLoading(false);
    }
  };

  const moveToRight = () => {
    if (selectedLeftIds.size === 0) return;

    const selected = new Set(selectedLeftIds);
    setLeftServiceIds((prev) => prev.filter((id) => !selected.has(id)));
    setRightServiceIds((prev) => [...prev, ...Array.from(selected).filter((id) => !prev.includes(id))]);
    setSelectedLeftIds(new Set());
  };

  const moveToLeft = () => {
    if (selectedRightIds.size === 0) return;

    const selected = new Set(selectedRightIds);
    setRightServiceIds((prev) => prev.filter((id) => !selected.has(id)));
    setLeftServiceIds((prev) => [...prev, ...Array.from(selected).filter((id) => !prev.includes(id))]);
    setSelectedRightIds(new Set());
  };

  const toggleLeftSelection = (id: string, checked: boolean) => {
    setSelectedLeftIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleRightSelection = (id: string, checked: boolean) => {
    setSelectedRightIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSaveServiceAssignments = async () => {
    if (!selectedEquipment) return;

    try {
      setIsServicesSaving(true);

      const response = await fetch(`/api/equipment/${selectedEquipment.id}/services`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds: rightServiceIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to save assignments');
      }

      toast.success('Przypisania usług zostały zapisane');
      setIsServicesDialogOpen(false);
      setSelectedEquipment(null);
      setSelectedLeftIds(new Set());
      setSelectedRightIds(new Set());
    } catch (error) {
      toast.error('Nie udało się zapisać przypisań usług');
    } finally {
      setIsServicesSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sprzet salonu</h1>
        <Button onClick={handleOpenAddDialog}>
          <Plus className="mr-2 h-4 w-4" /> Dodaj sprzet
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : equipment.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground text-lg">Brak sprzetu. Dodaj pierwszy sprzet.</p>
          <Button variant="outline" className="mt-4" onClick={handleOpenAddDialog}>
            Dodaj teraz
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map((item) => (
            <Card
              key={item.id}
              className={`${!item.is_active ? 'opacity-70 bg-muted/30' : ''} cursor-pointer hover:border-primary/50 transition-colors`}
              onClick={() => handleOpenServicesDialog(item)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xl font-semibold truncate pr-2">
                  {item.name}
                </CardTitle>
                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                  {item.is_active ? 'Aktywny' : 'Nieaktywny'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <Badge variant="outline" className="capitalize">
                    {getTypeLabel(item.type)}
                  </Badge>
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {item.description}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEditDialog(item);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" /> Edytuj
                </Button>
                <Button
                  variant={item.is_active ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(item);
                  }}
                >
                  {item.is_active ? (
                    <>
                      <PowerOff className="h-4 w-4 mr-2" /> Dezaktywuj
                    </>
                  ) : (
                    <>
                      <Power className="h-4 w-4 mr-2" /> Aktywuj
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edytuj sprzęt' : 'Dodaj nowy sprzęt'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa sprzętu</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="np. Laser diodowy"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz typ" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Opis (opcjonalnie)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Dodatkowe informacje o sprzęcie..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Zapisz zmiany' : 'Dodaj sprzęt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isServicesDialogOpen}
        onOpenChange={(open) => {
          setIsServicesDialogOpen(open);
          if (!open) {
            setSelectedEquipment(null);
            setSelectedLeftIds(new Set());
            setSelectedRightIds(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>
              Przypisz usługi do sprzętu {selectedEquipment ? `- ${selectedEquipment.name}` : ''}
            </DialogTitle>
          </DialogHeader>

          {isServicesLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Nieprzypisane usługi ({leftServices.length})</p>
                <ScrollArea className="h-72 rounded-md border p-2">
                  <div className="space-y-2">
                    {leftServices.map((service) => (
                      <label
                        key={service.id}
                        className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedLeftIds.has(service.id)}
                          onCheckedChange={(checked) =>
                            toggleLeftSelection(service.id, checked === true)
                          }
                        />
                        <span className="text-sm">{service.name}</span>
                      </label>
                    ))}
                    {leftServices.length === 0 && (
                      <p className="text-sm text-muted-foreground px-2 py-1">Brak usług</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex md:flex-col items-center justify-center gap-2">
                <Button type="button" variant="outline" onClick={moveToRight}>
                  Przypisz
                </Button>
                <Button type="button" variant="outline" onClick={moveToLeft}>
                  Usuń
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Przypisane usługi ({rightServices.length})</p>
                <ScrollArea className="h-72 rounded-md border p-2">
                  <div className="space-y-2">
                    {rightServices.map((service) => (
                      <label
                        key={service.id}
                        className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedRightIds.has(service.id)}
                          onCheckedChange={(checked) =>
                            toggleRightSelection(service.id, checked === true)
                          }
                        />
                        <span className="text-sm">{service.name}</span>
                      </label>
                    ))}
                    {rightServices.length === 0 && (
                      <p className="text-sm text-muted-foreground px-2 py-1">Brak usług</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsServicesDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="button" disabled={isServicesSaving || isServicesLoading} onClick={handleSaveServiceAssignments}>
              {isServicesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
