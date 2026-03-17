'use client'

import { useState, useEffect, useCallback, FC } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useCurrentRole } from '@/hooks/use-current-role'
import { XIcon, PlusIcon } from 'lucide-react'

type TreatmentProtocolField = {
  id: string
  label: string
  type: 'text' | 'number' | 'select' | 'boolean'
  options?: string[]
  required: boolean
}

type TreatmentProtocol = {
  id: string
  salon_id: string
  service_id: string | null
  name: string
  description: string | null
  version: number
  fields: Array<TreatmentProtocolField>
  is_active: boolean
  created_at: string
}

type Service = { id: string; name: string }

type ServicesResponse = {
  services?: Array<{
    subcategories?: Array<{
      services?: Service[]
    }>
  }>
}

const NO_SERVICE_VALUE = '__none__'

function flattenServiceOptions(payload: ServicesResponse): Service[] {
  return (payload.services ?? []).flatMap(category =>
    (category.subcategories ?? []).flatMap(subcategory => subcategory.services ?? [])
  )
}

type ProtocolFormDialogProps = {
  protocol?: TreatmentProtocol | null
  services: Service[]
  onSave: (protocol: Partial<TreatmentProtocol>) => Promise<void>
  trigger: React.ReactNode
}

const ProtocolFormDialog: FC<ProtocolFormDialogProps> = ({
  protocol,
  services,
  onSave,
  trigger,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<TreatmentProtocol>>(
    protocol || {}
  )
  const [fields, setFields] = useState<TreatmentProtocolField[]>(
    protocol?.fields || []
  )

  useEffect(() => {
    if (isOpen) {
      const initialData = protocol || { name: '', description: '', service_id: null, version: 1, fields: [] };
      setFormData(initialData);
      setFields((initialData as TreatmentProtocol).fields || []);
    }
  }, [isOpen, protocol])

  const handleAddField = () => {
    setFields([
      ...fields,
      {
        id: crypto.randomUUID(),
        label: '',
        type: 'text',
        required: false,
        options: [],
      },
    ])
  }

  const handleRemoveField = (id: string) => {
    setFields(fields.filter(field => field.id !== id))
  }

  const handleFieldChange = (
    id: string,
    key: keyof TreatmentProtocolField,
    value: any
  ) => {
    setFields(
      fields.map(field => (field.id === id ? { ...field, [key]: value } : field))
    )
  }

  const handleOptionsChange = (id: string, optionsString: string) => {
    const options = optionsString.split(',').map(opt => opt.trim()).filter(Boolean);
    handleFieldChange(id, 'options', options);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave({ ...formData, fields })
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {protocol ? 'Edytuj protokół zabiegowy' : 'Nowy protokół zabiegowy'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa protokołu</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_id">Powiązana usługa (opcjonalnie)</Label>
               <Select
                value={formData.service_id ?? NO_SERVICE_VALUE}
                onValueChange={value =>
                  setFormData({
                    ...formData,
                    service_id: value === NO_SERVICE_VALUE ? null : value,
                  })
                }
              >
                <SelectTrigger id="service_id">
                  <SelectValue placeholder="Wybierz usługę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SERVICE_VALUE}>Brak</SelectItem>
                  {services.map(service => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={e =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Pola formularza</h3>
            <div className="space-y-4">
              {fields.map(field => (
                <div key={field.id} className="grid grid-cols-12 gap-2 p-3 border rounded-md items-center">
                   <div className="col-span-12 md:col-span-4 space-y-2">
                     <Label>Etykieta pola</Label>
                    <Input
                      placeholder="Np. 'Ciśnienie krwi'"
                      value={field.label}
                      onChange={e =>
                        handleFieldChange(field.id, 'label', e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3 space-y-2">
                    <Label>Typ pola</Label>
                    <Select
                      value={field.type}
                      onValueChange={(value: TreatmentProtocolField['type']) =>
                        handleFieldChange(field.id, 'type', value)
                      }
                    >
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Tekst</SelectItem>
                        <SelectItem value="number">Liczba</SelectItem>
                        <SelectItem value="boolean">Tak/Nie</SelectItem>
                        <SelectItem value="select">Wybór</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                   <div className="col-span-6 md:col-span-3 items-center pt-6 flex space-x-2">
                     <Checkbox
                       id={`required-${field.id}`}
                       checked={field.required}
                       onCheckedChange={checked => handleFieldChange(field.id, 'required', !!checked)}
                     />
                     <Label htmlFor={`required-${field.id}`}>Wymagane</Label>
                   </div>
                   <div className="col-span-12 md:col-span-1 items-center pt-6 flex justify-end">
                     <Button variant="ghost" size="icon" type="button" onClick={() => handleRemoveField(field.id)}>
                       <XIcon className="h-4 w-4" />
                     </Button>
                   </div>
                   {field.type === 'select' && (
                     <div className="col-span-12 space-y-2">
                       <Label>Opcje (oddzielone przecinkami)</Label>
                       <Input
                         placeholder="Np. Opcja 1, Opcja 2, Opcja 3"
                         value={field.options?.join(', ') || ''}
                         onChange={e => handleOptionsChange(field.id, e.target.value)}
                       />
                     </div>
                   )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={handleAddField} className="mt-2">
              <PlusIcon className="mr-2 h-4 w-4" /> Dodaj pole
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Anuluj</Button>
            <Button type="submit">Zapisz protokół</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function TreatmentProtocolsPage() {
  const [protocols, setProtocols] = useState<TreatmentProtocol[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [featureUnavailable, setFeatureUnavailable] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { currentRole } = useCurrentRole()

  const canManage = currentRole === 'owner' || currentRole === 'manager'

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [protocolsRes, servicesRes] = await Promise.all([
        fetch('/api/treatment-protocols?all=true'),
        fetch('/api/services'),
      ])
      const protocolsData = await protocolsRes.json()
      const servicesData = await servicesRes.json()
      if (protocolsRes.status === 403) {
        setFeatureUnavailable(true)
        setProtocols([])
      } else if (protocolsRes.ok) {
        setFeatureUnavailable(false)
        setProtocols(protocolsData.protocols || [])
      } else {
        throw new Error(protocolsData.message || 'Failed to fetch treatment protocols')
      }

      if (servicesRes.ok) {
        setServices(flattenServiceOptions(servicesData))
      } else {
        throw new Error(servicesData.message || 'Failed to fetch services')
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to fetch treatment protocol data'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaveProtocol = async (data: Partial<TreatmentProtocol>) => {
    const isEditing = !!data.id
    const url = isEditing
      ? `/api/treatment-protocols/${data.id}`
      : '/api/treatment-protocols'
    const method = isEditing ? 'PATCH' : 'POST'

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        throw new Error('Failed to save protocol')
      }
      await fetchData()
    } catch (error) {
      console.error('Save operation failed:', error)
    }
  }

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Czy na pewno chcesz dezaktywować ten protokół?')) return

    try {
      const response = await fetch(`/api/treatment-protocols/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!response.ok) {
        throw new Error('Failed to deactivate protocol')
      }
      await fetchData()
    } catch (error) {
      console.error('Deactivation failed:', error)
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Protokoły Zabiegowe</h1>
        {canManage && !featureUnavailable && (
           <ProtocolFormDialog
            services={services}
            onSave={handleSaveProtocol}
            trigger={<Button>Utwórz nowy protokół</Button>}
          />
        )}
      </div>

      {!loading && featureUnavailable && (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Treatment protocols are not available for this salon. The `treatment_records` feature
          flag is required.
        </div>
      )}

      {!loading && !featureUnavailable && errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-1/4" />
                <Skeleton className="h-5 w-1/4" />
              </div>
              <div className="flex gap-2">
                 <Skeleton className="h-5 w-20" />
                 <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !featureUnavailable && protocols.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-gray-500">Brak protokołów</p>
          <p className="text-sm text-gray-400 mt-2">Utwórz swój pierwszy protokół, aby rozpocząć.</p>
        </div>
      )}

      {!loading && !featureUnavailable && protocols.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {protocols.map(protocol => (
            <div key={protocol.id} className="border rounded-lg p-4 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-lg font-semibold">{protocol.name}</h2>
                  <Badge variant={protocol.is_active ? 'default' : 'secondary'}>
                    {protocol.is_active ? 'Aktywny' : 'Nieaktywny'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  {protocol.service_id
                    ? services.find(s => s.id === protocol.service_id)?.name || 'Usunięta usługa'
                    : 'Brak powiązanej usługi'}
                </div>
                 <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Badge variant="outline">Wersja: {protocol.version}</Badge>
                    <Badge variant="outline">Pola: {protocol.fields?.length || 0}</Badge>
                 </div>
              </div>
              
              {canManage && (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <ProtocolFormDialog
                    protocol={protocol}
                    services={services}
                    onSave={handleSaveProtocol}
                    trigger={<Button variant="outline" size="sm">Edytuj</Button>}
                  />
                  {protocol.is_active && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeactivate(protocol.id)}
                    >
                      Dezaktywuj
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
