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
import { Plus, Search, UserCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDebounce } from '@/hooks/use-debounce'

const clientFormSchema = z.object({
  fullName: z.string().min(2, 'Minimum 2 znaki'),
  phone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr'),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientFormSchema>

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  const debouncedSearch = useDebounce(search, 300)
  const { data: clients, isLoading } = useClients(debouncedSearch)
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

  const handleSubmit = async (data: ClientFormData) => {
    await createMutation.mutateAsync(data)
    setIsDialogOpen(false)
    form.reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Klienci</h1>
          <p className="mt-2 text-gray-600">Zarządzaj bazą klientów</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj klienta
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Szukaj po imieniu lub telefonie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Clients List */}
      {isLoading ? (
        <div className="text-center py-12">Ładowanie...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients?.map((client) => (
            <Card key={client.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-purple-600" />
                    <span className="text-base">{client.full_name}</span>
                  </div>
                  <Badge variant="secondary">{client.client_code}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-gray-600">📱 {client.phone}</p>
                {client.email && <p className="text-gray-600">📧 {client.email}</p>}
                <div className="pt-2 border-t">
                  <p className="text-gray-600">
                    Liczba wizyt:{' '}
                    <span className="font-medium text-gray-900">
                      {client.visit_count}
                    </span>
                  </p>
                </div>
                {client.notes && (
                  <p className="text-xs text-gray-500 italic">{client.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {clients?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCircle className="mx-auto h-12 w-12 text-gray-400" />
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

      {/* Add Client Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj klienta</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Imię i nazwisko *</Label>
              <Input
                id="fullName"
                {...form.register('fullName')}
                placeholder="Anna Kowalska"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon *</Label>
              <Input
                id="phone"
                {...form.register('phone')}
                placeholder="123456789"
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Input
                id="notes"
                {...form.register('notes')}
                placeholder="Preferencje, uwagi..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Dodaj
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}