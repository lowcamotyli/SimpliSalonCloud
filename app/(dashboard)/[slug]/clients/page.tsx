'use client'

import { useState } from 'react'
import { useClients, useCreateClient } from '@/hooks/use-clients'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Search, UserCircle, Phone, Mail, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDebounce } from '@/hooks/use-debounce'
import { formatPhoneNumber, parsePhoneNumber, getRelativeTime } from '@/lib/formatters'
import { toast } from 'sonner'

const clientFormSchema = z.object({
  fullName: z.string().min(2, 'Minimum 2 znaki'),
  phone: z.string().regex(/^[\d\s\-\+()]*$/, 'Nieprawidłowy format telefonu').optional().or(z.literal('')),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientFormSchema>

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  
  const debouncedSearch = useDebounce(search, 300)
  const { data: clients, isLoading, mutate } = useClients(debouncedSearch)
  const createMutation = useCreateClient()

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      notes: '',
    },
  })

  const handleAddClient = () => {
    setSelectedClient(null)
    form.reset()
    setIsDialogOpen(true)
  }

  const handleEditClient = (client: any) => {
    setSelectedClient(client)
    form.reset({
      fullName: client.full_name,
      phone: client.phone || '',
      email: client.email || '',
      notes: client.notes || '',
    })
    setIsDialogOpen(true)
  }

  const handleDeleteClient = async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Czy na pewno chcesz usunąć tego klienta?')) return
    
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('Błąd usuwania')
      
      toast.success('Klient usunięty')
      mutate()
    } catch (error) {
      toast.error('Nie udało się usunąć klienta')
    }
  }

  const handleSubmit = async (data: ClientFormData) => {
    try {
      const payload = {
        fullName: data.fullName,
        phone: data.phone ? parsePhoneNumber(data.phone) : '',
        email: data.email || '',
        notes: data.notes || '',
      }
      
      await createMutation.mutateAsync(payload)
      setIsDialogOpen(false)
      form.reset()
      mutate()
      toast.success(selectedClient ? 'Klient zaktualizowany' : 'Klient dodany')
    } catch (error) {
      toast.error('Błąd podczas zapisywania klienta')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold gradient-text">Klienci</h1>
        <p className="mt-2 text-gray-600">Zarządzaj bazą swoich klientów ({clients?.length || 0})</p>
      </div>

      {/* Search and Add */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj po imieniu, telefonie lub emailu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 glass rounded-xl"
          />
        </div>
        <Button
          onClick={handleAddClient}
          className="gradient-button rounded-xl shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nowy klient
        </Button>
      </div>

      {/* Clients Grid */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Ładowanie klientów...</p>
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Card
              key={client.id}
              className="glass p-4 rounded-xl group hover:shadow-lg transition-all cursor-pointer card-hover"
              onClick={() => handleEditClient(client)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <UserCircle className="h-5 w-5 text-purple-600" />
                      <h3 className="font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                        {client.full_name}
                      </h3>
                    </div>
                    {client.created_at && (
                      <p className="text-xs text-gray-500">
                        Dodany {getRelativeTime(client.created_at)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeleteClient(client.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 text-sm">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <a 
                        href={`tel:${client.phone}`} 
                        className="hover:text-purple-600 transition-colors truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatPhoneNumber(client.phone)}
                      </a>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <a 
                        href={`mailto:${client.email}`} 
                        className="hover:text-purple-600 transition-colors truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.email}
                      </a>
                    </div>
                  )}
                </div>

                {client.visit_count && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/20">
                    <span className="text-xs text-gray-500">Liczba wizyt:</span>
                    <Badge className="bg-purple-100 text-purple-700">{client.visit_count}</Badge>
                  </div>
                )}

                {client.notes && (
                  <p className="text-xs text-gray-500 italic border-t border-white/20 pt-2">
                    {client.notes}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass rounded-xl">
          <CardContent className="py-12 text-center">
            <UserCircle className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {search ? 'Brak wyników' : 'Brak klientów'}
            </h3>
            <p className="mt-2 text-gray-600">
              {search
                ? 'Spróbuj innej frazy wyszukiwania'
                : 'Dodaj pierwszego klienta, aby rozpocząć'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Client Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text">
              {selectedClient ? 'Edytuj klienta' : 'Dodaj nowego klienta'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Imię i nazwisko *</Label>
              <Input
                id="fullName"
                {...form.register('fullName')}
                placeholder="Anna Kowalska"
                className="glass rounded-lg"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                {...form.register('phone')}
                placeholder="+48 123 456 789"
                className="glass rounded-lg"
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register('email')}
                placeholder="anna@example.com"
                className="glass rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Input
                id="notes"
                {...form.register('notes')}
                placeholder="Preferencje, uwagi..."
                className="glass rounded-lg"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="rounded-lg"
              >
                Anuluj
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                className="gradient-button rounded-lg"
              >
                {selectedClient ? 'Zaktualizuj' : 'Dodaj'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
