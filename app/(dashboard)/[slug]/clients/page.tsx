'use client'

import { useState, useMemo } from 'react'
import { useClients, useCreateClient } from '@/hooks/use-clients'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  UserCircle,
  Phone,
  Mail,
  Trash2,
  Users,
  TrendingUp,
  Sparkles,
  Award,
  Calendar,
  ChevronRight,
  User,
  MessageSquare
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDebounce } from '@/hooks/use-debounce'
import { formatPhoneNumber, parsePhoneNumber, getRelativeTime } from '@/lib/formatters'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { EmptyState } from '@/components/ui/empty-state'

const clientFormSchema = z.object({
  fullName: z.string().min(2, 'Minimum 2 znaki'),
  phone: z.string().regex(/^[\d\s\-\+()]{9,}$/, 'Telefon musi mieć min. 9 cyfr').optional().or(z.literal('')),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientFormSchema>

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)

  const debouncedSearch = useDebounce(search, 300)
  const { data: clients, isLoading, refetch } = useClients(debouncedSearch)
  const createMutation = useCreateClient()

  const stats = useMemo(() => {
    if (!clients) return { total: 0, avgVisits: 0, topClient: null }
    const total = clients.length
    const totalVisits = clients.reduce((acc: number, curr: any) => acc + (curr.visit_count || 0), 0)
    const avgVisits = total > 0 ? totalVisits / total : 0
    const topClient = [...clients].sort((a: any, b: any) => (b.visit_count || 0) - (a.visit_count || 0))[0]

    return {
      total,
      avgVisits: Math.round(avgVisits * 10) / 10,
      topClient: topClient?.visit_count > 0 ? topClient : null
    }
  }, [clients])

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      notes: '',
    },
    mode: 'onChange',
  })

  const handleAddClient = () => {
    setSelectedClient(null)
    form.reset({
      fullName: '',
      phone: '',
      email: '',
      notes: '',
    })
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
      refetch()
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
      refetch()
      toast.success(selectedClient ? 'Klient zaktualizowany' : 'Klient dodany')
    } catch (error) {
      toast.error('Błąd podczas zapisywania klienta')
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Klienci
          </h1>
          <p className="text-gray-500 text-base font-medium">Buduj trwałe relacje ze swoimi klientami</p>
        </div>
        <Button
          size="lg"
          className="gradient-button shadow-lg shadow-primary/20 h-12 px-6 rounded-xl font-bold"
          onClick={handleAddClient}
        >
          <Plus className="h-5 w-5 mr-2" />
          Dodaj klienta
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Baza klientów</p>
            <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Śr. wizyt</p>
            <p className="text-2xl font-black text-gray-900">{stats.avgVisits}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Top Klient</p>
            <p className="text-xl font-black text-gray-900 truncate">
              {stats.topClient ? stats.topClient.full_name : '---'}
            </p>
          </div>
        </Card>
      </div>

      {/* Search Bar */}
      <Card className="p-6 glass border-none shadow-xl shadow-slate-200/50">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj po imieniu, telefonie lub adresie e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 bg-white/50 border-gray-200/50 focus:bg-white transition-all text-base rounded-xl"
          />
        </div>
      </Card>

      {/* Clients List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="h-12 w-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Ładowanie bazy klientów...</p>
        </div>
      ) : clients && clients.length > 0 ? (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {clients.map((client: any) => (
              <motion.div
                key={client.id}
                layout
                variants={itemVariants}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card
                  className="group relative overflow-hidden p-5 transition-all border-none bg-white hover:shadow-2xl hover:shadow-primary/10 cursor-pointer"
                  onClick={() => handleEditClient(client)}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                          <User className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                            {client.full_name}
                          </h3>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            ID: {client.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                        onClick={(e) => handleDeleteClient(client.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-2.5">
                      {client.phone && (
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                          <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                            <Phone className="h-4 w-4" />
                          </div>
                          <a
                            href={`tel:${client.phone}`}
                            className="hover:text-primary transition-colors truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatPhoneNumber(client.phone)}
                          </a>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                          <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                            <Mail className="h-4 w-4" />
                          </div>
                          <a
                            href={`mailto:${client.email}`}
                            className="hover:text-primary transition-colors truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {client.email}
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Wizyty
                        </span>
                        <span className="text-lg font-black text-gray-900 leading-none mt-1">
                          {client.visit_count || 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Ostatnio
                        </span>
                        <span className="text-xs font-bold text-gray-600 mt-1">
                          {client.created_at ? getRelativeTime(client.created_at) : '---'}
                        </span>
                      </div>
                    </div>

                    {client.notes && (
                      <div className="p-3 bg-slate-50 rounded-xl relative">
                        <MessageSquare className="absolute -top-1 -left-1 h-3 w-3 text-slate-200" />
                        <p className="text-xs text-gray-500 italic line-clamp-2 pl-2">
                          {client.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <EmptyState
          icon={search ? Search : Sparkles}
          title={search ? 'Nie znaleziono klientów' : 'Baza klientów jest pusta'}
          description={search
            ? 'Spróbuj zmienić parametry wyszukiwania lub wyczyść filtry.'
            : 'Nie masz jeszcze żadnych klientów. Dodaj pierwszą osobę, aby zacząć budować historię wizyt!'}
          actionLabel={search ? 'Wyczyść szukanie' : 'Dodaj pierwszą osobę'}
          onAction={search ? () => setSearch('') : handleAddClient}
        />
      )}

      {/* Add/Edit Client Dialog */}
      <AnimatePresence>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md glass rounded-2xl">
            <DialogHeader>
              <DialogTitle className="gradient-text text-2xl">
                {selectedClient ? 'Edytuj klienta' : 'Nowy klient'}
              </DialogTitle>
              <DialogDescription>
                Zarządzaj danymi kontaktowymi i informacjami o kliencie.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="font-bold text-gray-700">Imię i nazwisko *</Label>
                  <div className="relative">
                    <Input
                      id="fullName"
                      {...form.register('fullName')}
                      placeholder="Anna Kowalska"
                      className="glass h-11 rounded-xl focus:bg-white pl-10"
                    />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                  </div>
                  {form.formState.errors.fullName && (
                    <p className="text-xs text-rose-600 font-bold">
                      {form.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="font-bold text-gray-700">Telefon</Label>
                    <div className="relative">
                      <Input
                        id="phone"
                        {...form.register('phone')}
                        placeholder="9-cyfrowy numer"
                        className="glass h-11 rounded-xl focus:bg-white pl-10"
                      />
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    </div>
                    {form.formState.errors.phone && (
                      <p className="text-xs text-rose-600 font-bold">
                        {form.formState.errors.phone.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-bold text-gray-700">Email</Label>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        {...form.register('email')}
                        placeholder="anna@example.com"
                        className="glass h-11 rounded-xl focus:bg-white pl-10"
                      />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    </div>
                    {form.formState.errors.email && (
                      <p className="text-xs text-rose-600 font-bold">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="font-bold text-gray-700">Notatki / Preferencje</Label>
                  <Input
                    id="notes"
                    {...form.register('notes')}
                    placeholder="Ważne informacje o kliencie..."
                    className="glass h-11 rounded-xl focus:bg-white"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-xl font-bold"
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="gradient-button rounded-xl font-bold flex-1"
                >
                  {selectedClient ? 'Zapisz zmiany' : 'Dodaj klienta'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </AnimatePresence>
    </div>
  )
}
