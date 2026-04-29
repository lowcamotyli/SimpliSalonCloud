'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Edit2, Power, PowerOff, Loader2, LayoutGrid, LayoutList } from 'lucide-react';

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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import EquipmentListView from '@/components/equipment/equipment-list-view';

interface Equipment {
  id: string;
  salon_id: string;
  name: string;
  type: 'laser' | 'fotel' | 'stol_manicure' | 'fotopolimeryzator' | 'inne' | 'other';
  description?: string;
  is_active: boolean;
  created_at: string;
  assigned_services_count?: number;
  service_equipment?: { equipment_id: string }[];
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

const getAssignedServicesCount = (item: Equipment): number => {
  if (typeof item.assigned_services_count === 'number') {
    return item.assigned_services_count;
  }

  return item.service_equipment?.length ?? 0;
};

const parseApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const data = await response.json().catch(() => null);
  if (typeof data?.message === 'string' && data.message.length > 0) {
    return data.message;
  }
  if (typeof data?.error === 'string' && data.error.length > 0) {
    return data.error;
  }
  return fallback;
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
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>(() =>
    typeof window !== 'undefined'
      ? ((localStorage.getItem('equipment-view-mode') as 'tiles' | 'list') ?? 'tiles')
      : 'tiles'
  );
  const [isPostCreateOpen, setIsPostCreateOpen] = useState(false);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [postCreateSelected, setPostCreateSelected] = useState<string[]>([]);
  const [isPostCreateLoading, setIsPostCreateLoading] = useState(false);
  const [postCreateLoadError, setPostCreateLoadError] = useState<string | null>(null);
  const [isPostCreateSaving, setIsPostCreateSaving] = useState(false);

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

  useEffect(() => {
    localStorage.setItem('equipment-view-mode', viewMode);
  }, [viewMode]);

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

  const loadServiceOptions = async () => {
    const allServicesResponse = await fetch('/api/services');
    if (!allServicesResponse.ok) {
      throw new Error('Failed to fetch services');
    }
    const allServicesData = await allServicesResponse.json();
    const allServices = flattenServicesResponse(allServicesData);
    setServiceOptions(allServices);
  };

  const openPostCreateDialog = async (equipmentId: string) => {
    setNewlyCreatedId(equipmentId);
    setPostCreateSelected([]);
    setPostCreateLoadError(null);
    setIsPostCreateOpen(true);

    if (serviceOptions.length > 0) {
      return;
    }

    try {
      setIsPostCreateLoading(true);
      await loadServiceOptions();
    } catch {
      setPostCreateLoadError('Nie udało się pobrać usług. Spróbuj ponownie.');
    } finally {
      setIsPostCreateLoading(false);
    }
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
      const data = await response.json().catch(() => null);

      toast.success(editingItem ? 'Sprzęt zaktualizowany' : 'Sprzęt dodany pomyślnie');
      setIsDialogOpen(false);
      if (!editingItem) {
        const createdId = data?.equipment?.id;
        if (createdId) {
          await openPostCreateDialog(createdId);
        }
      }
      fetchEquipment();
    } catch (error) {
      toast.error('Wystąpił błąd podczas zapisywania');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/equipment/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });

      if (!response.ok) throw new Error('Failed to toggle status');

      toast.success(isActive ? 'Sprzęt dezaktywowany' : 'Sprzęt aktywowany');
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
        const errorMessage = await parseApiErrorMessage(
          response,
          'Nie udalo sie zapisac przypisan uslug'
        );
        throw new Error(errorMessage);
      }

      toast.success('Przypisania usług zostały zapisane');
      setIsServicesDialogOpen(false);
      setSelectedEquipment(null);
      setSelectedLeftIds(new Set());
      setSelectedRightIds(new Set());
      await fetchEquipment();
    } catch (error) {
      toast.error('Nie udało się zapisać przypisań usług');
    } finally {
      setIsServicesSaving(false);
    }
  };

  async function handlePostCreateSave() {
    if (!newlyCreatedId || postCreateSelected.length === 0) return;
    setIsPostCreateSaving(true);
    try {
      const res = await fetch(`/api/equipment/${newlyCreatedId}/services`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds: postCreateSelected }),
      });
      if (!res.ok) {
        const errorMessage = await parseApiErrorMessage(res, 'Blad przypisania uslug');
        throw new Error(errorMessage);
      }
      toast.success('Uslugi przypisane');
      setIsPostCreateOpen(false);
      setNewlyCreatedId(null);
      setPostCreateSelected([]);
      await fetchEquipment();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blad przypisania uslug';
      toast.error(message);
    } finally {
      setIsPostCreateSaving(false);
    }
  }

  function handleSkipPostCreate() {
    setIsPostCreateOpen(false);
    setNewlyCreatedId(null);
    setPostCreateSelected([]);
    setPostCreateLoadError(null);
  }

  async function handleRetryPostCreateLoad() {
    if (!newlyCreatedId) return;
    try {
      setPostCreateLoadError(null);
      setIsPostCreateLoading(true);
      await loadServiceOptions();
    } catch {
      setPostCreateLoadError('Nie udało się pobrać usług. Spróbuj ponownie.');
    } finally {
      setIsPostCreateLoading(false);
    }
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-normal text-[var(--v3-text-primary)] sm:text-4xl">Sprzet salonu</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'tiles' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('tiles')}
            title="Widok kafelki"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="icon"
            onClick={() => setViewMode('list')}
            title="Widok lista"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button onClick={handleOpenAddDialog}>
            <Plus className="mr-2 h-4 w-4" /> Dodaj sprzet
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : equipment.length === 0 ? (
        <div className="rounded-[var(--v3-r-md)] border border-dashed border-[var(--v3-border)] bg-[var(--v3-surface)] py-20 text-center shadow-[var(--v3-shadow-card)]">
          <p className="text-muted-foreground text-lg">Brak sprzetu. Dodaj pierwszy sprzet.</p>
          <Button variant="outline" className="mt-4" onClick={handleOpenAddDialog}>
            Dodaj teraz
          </Button>
        </div>
      ) : viewMode === 'list' ? (
        <EquipmentListView
          equipment={equipment}
          onEdit={(item) => {
            setEditingItem(item as Equipment);
            setFormData({
              name: item.name,
              type: item.type as Equipment['type'],
              description: item.description ?? '',
            });
            setIsDialogOpen(true);
          }}
          onToggleStatus={(id, is_active) => handleToggleStatus(id, is_active)}
          onOpenServices={(item) => {
            handleOpenServicesDialog(item as Equipment);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {equipment.map((item) => (
            <Card
              key={item.id}
              className={`${!item.is_active ? 'opacity-70 bg-[var(--v3-bg-alt)]' : 'bg-[var(--v3-surface)]'} cursor-pointer rounded-[var(--v3-r-md)] border border-[var(--v3-border)] shadow-[var(--v3-shadow-card)] transition-[border-color,box-shadow] hover:border-[var(--v3-border-strong)] hover:shadow-[var(--v3-shadow-card-hover)]`}
              onClick={() => handleOpenServicesDialog(item)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-[var(--v3-border)] pb-3">
                <CardTitle className="text-xl font-semibold truncate pr-2 theme-service-name">
                  {item.name}
                </CardTitle>
                <Badge variant={item.is_active ? 'success' : 'neutral'}>
                  {item.is_active ? 'Aktywny' : 'Nieaktywny'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div>
                  <Badge variant="neutral" className="capitalize">
                    {getTypeLabel(item.type)}
                  </Badge>
                </div>
                <div>
                  <Badge variant={getAssignedServicesCount(item) === 0 ? 'neutral' : 'info'}>
                    {getAssignedServicesCount(item)} uslug
                  </Badge>
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {item.description}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-[var(--v3-border)] pt-4">
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
                    handleToggleStatus(item.id, item.is_active);
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

      <Dialog
        open={isPostCreateOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsPostCreateOpen(true);
            return;
          }
          handleSkipPostCreate();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Przypisz do uslugi</DialogTitle>
            <DialogDescription>
              Opcjonalnie przypisz nowy sprzet do uslug salonu. Mozesz to zrobic pozniej.
            </DialogDescription>
          </DialogHeader>
          {isPostCreateLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="max-h-[360px] pr-4">
              <div className="space-y-3">
                {postCreateLoadError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <p>{postCreateLoadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleRetryPostCreateLoad}
                      disabled={isPostCreateLoading || !newlyCreatedId}
                    >
                      Sprobuj ponownie
                    </Button>
                  </div>
                )}
                {!postCreateLoadError && serviceOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Brak uslug do przypisania.</p>
                )}
                {!postCreateLoadError &&
                  serviceOptions.map((service) => (
                    <div key={service.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`pc-svc-${service.id}`}
                        checked={postCreateSelected.includes(service.id)}
                        onCheckedChange={(checked) =>
                          setPostCreateSelected((prev) =>
                            checked ? [...prev, service.id] : prev.filter((id) => id !== service.id)
                          )
                        }
                      />
                      <Label htmlFor={`pc-svc-${service.id}`} className="cursor-pointer">
                        {service.name}
                      </Label>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleSkipPostCreate}>
              Pomin
            </Button>
            <Button
              onClick={handlePostCreateSave}
              disabled={
                isPostCreateLoading ||
                isPostCreateSaving ||
                postCreateSelected.length === 0 ||
                !!postCreateLoadError
              }
            >
              {isPostCreateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Przypisz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
