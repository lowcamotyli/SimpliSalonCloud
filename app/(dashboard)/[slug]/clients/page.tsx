'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useClients, useCreateClient } from '@/hooks/use-clients'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

type TemplateChannel = 'email' | 'sms' | 'both'

type QuickTemplate = {
  id: string
  name: string
  channel: TemplateChannel
  subject: string | null
  body: string
}

type ClientMessageLog = {
  id: string
  created_at: string
  channel: 'email' | 'sms'
  subject: string | null
  body: string
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
  crm_campaigns?: { name: string | null } | null
}

const clientFormSchema = z.object({
  fullName: z.string().min(2, 'Minimum 2 znaki'),
  phone: z.string().regex(/^[\d\s\-\+()]{9,}$/, 'Telefon musi mieć min. 9 cyfr').optional().or(z.literal('')),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  notes: z.string().optional(),
})

type ClientFormData = z.infer<typeof clientFormSchema>

export default function ClientsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [search, setSearch] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [isQuickDialogOpen, setIsQuickDialogOpen] = useState(false)
  const [quickClient, setQuickClient] = useState<any>(null)
  const [quickChannel, setQuickChannel] = useState<'email' | 'sms'>('email')
  const [quickTemplateId, setQuickTemplateId] = useState('')
  const [quickSubject, setQuickSubject] = useState('')
  const [quickBody, setQuickBody] = useState('')
  const [isQuickSending, setIsQuickSending] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyClient, setHistoryClient] = useState<any>(null)
  const [historyPage, setHistoryPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)
  const { data: clients, isLoading, refetch } = useClients(debouncedSearch)
  const createMutation = useCreateClient()

  const { data: salon } = useQuery<{ id: string; slug: string } | null>({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('salons').select('id, slug').eq('slug', slug).single()
      if (error) throw error
      return data
    },
  })

  const salonId = salon?.id || ''

  const quickTemplatesQuery = useQuery<{ templates: QuickTemplate[]; locked?: boolean; reason?: string }>({
    queryKey: ['quick-templates', salonId],
    enabled: !!salonId && isQuickDialogOpen,
    queryFn: async () => {
      const res = await fetch(`/api/crm/templates?salonId=${salonId}`)
      const payload = await res.json().catch(() => ({}))
      if (res.status === 403) {
        return { templates: [], locked: true, reason: payload?.error || 'Szablony CRM niedostępne w tym planie' }
      }
      if (!res.ok) throw new Error(payload?.error || 'Nie udało się pobrać szablonów')
      return { templates: payload.templates || [] }
    },
  })

  const clientHistoryQuery = useQuery<{ logs: ClientMessageLog[]; pagination: { page: number; totalPages: number } }>({
    queryKey: ['client-message-history', salonId, historyClient?.id, historyPage],
    enabled: !!salonId && !!historyClient?.id && isHistoryOpen,
    queryFn: async () => {
      const params = new URLSearchParams({
        salonId,
        clientId: historyClient.id,
        page: String(historyPage),
        pageSize: '10',
      })

      const res = await fetch(`/api/crm/logs?${params.toString()}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Nie udało się pobrać historii komunikacji')
      return {
        logs: payload.logs || [],
        pagination: payload.pagination || { page: 1, totalPages: 1 },
      }
    },
  })

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

  const openQuickSend = (client: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setQuickClient(client)
    const preferredChannel = client.email ? 'email' : 'sms'
    setQuickChannel(preferredChannel)
    setQuickTemplateId('')
    setQuickSubject('')
    setQuickBody('')
    setIsQuickDialogOpen(true)
  }

  const openClientHistory = (client: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistoryClient(client)
    setHistoryPage(1)
    setIsHistoryOpen(true)
  }

  const handleTemplatePick = (templateId: string) => {
    setQuickTemplateId(templateId)
    const selected = (quickTemplatesQuery.data?.templates || []).find((t) => t.id === templateId)
    if (!selected) return
    if (quickChannel === 'email' && selected.subject) {
      setQuickSubject(selected.subject)
    }
    setQuickBody(selected.body || '')
  }

  const handleQuickSend = async () => {
    if (!salonId || !quickClient?.id) return
    if (!quickBody.trim()) {
      toast.error('Wpisz treść wiadomości')
      return
    }
    if (quickChannel === 'email' && !quickSubject.trim()) {
      toast.error('Temat email jest wymagany')
      return
    }

    setIsQuickSending(true)
    try {
      const res = await fetch('/api/crm/quick-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salonId,
          clientId: quickClient.id,
          channel: quickChannel,
          templateId: quickTemplateId || null,
          subject: quickChannel === 'email' ? quickSubject : null,
          body: quickBody,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Wysyłka nie powiodła się')

      toast.success('Wiadomość wysłana')
      setIsQuickDialogOpen(false)
      setQuickTemplateId('')
      setQuickSubject('')
      setQuickBody('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Błąd wysyłki')
    } finally {
      setIsQuickSending(false)
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Klienci
          </h1>
          <p className="text-muted-foreground text-base font-medium">Buduj trwałe relacje ze swoimi klientami</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${slug}/clients/templates`}>
            <Button size="lg" variant="outline" className="h-12 px-6 rounded-xl font-bold">
              Szablony
            </Button>
          </Link>
          <Button
            size="lg"
            className="gradient-button shadow-lg shadow-primary/20 h-12 px-6 rounded-xl font-bold"
            onClick={handleAddClient}
          >
            <Plus className="h-5 w-5 mr-2" />
            Dodaj klienta
          </Button>
        </div>
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
                          <h3 className="font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {client.full_name}
                          </h3>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => openQuickSend(client, e)}
                      >
                        Wyślij wiadomość
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={(e) => openClientHistory(client, e)}
                      >
                        Historia
                      </Button>
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

      <Dialog open={isQuickDialogOpen} onOpenChange={setIsQuickDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Wyślij wiadomość</DialogTitle>
            <DialogDescription>
              {quickClient ? `Do: ${quickClient.full_name}` : 'Szybka wysyłka do pojedynczego klienta'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kanał</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={quickChannel === 'email' ? 'default' : 'outline'}
                  onClick={() => {
                    setQuickChannel('email')
                    setQuickTemplateId('')
                  }}
                >
                  Email
                </Button>
                <Button
                  type="button"
                  variant={quickChannel === 'sms' ? 'default' : 'outline'}
                  onClick={() => {
                    setQuickChannel('sms')
                    setQuickTemplateId('')
                  }}
                >
                  SMS
                </Button>
              </div>
            </div>

            {quickTemplatesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Ładowanie szablonów...</p>
            )}

            {quickTemplatesQuery.isError && (
              <p className="text-sm text-destructive">
                {quickTemplatesQuery.error instanceof Error
                  ? quickTemplatesQuery.error.message
                  : 'Nie udało się pobrać szablonów'}
              </p>
            )}

            {!quickTemplatesQuery.data?.locked && (
              <div className="space-y-2">
                <Label>Szablon (opcjonalnie)</Label>
                <select
                  value={quickTemplateId}
                  onChange={(e) => handleTemplatePick(e.target.value)}
                  className="w-full border rounded-md h-10 px-3 bg-background"
                >
                  <option value="">Brak szablonu</option>
                  {(quickTemplatesQuery.data?.templates || [])
                    .filter((t) => t.channel === 'both' || t.channel === quickChannel)
                    .map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                </select>
              </div>
            )}

            {quickChannel === 'email' && (
              <div className="space-y-2">
                <Label>Temat</Label>
                <Input value={quickSubject} onChange={(e) => setQuickSubject(e.target.value)} placeholder="Temat wiadomości" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Treść</Label>
              <Textarea value={quickBody} onChange={(e) => setQuickBody(e.target.value)} rows={6} placeholder="Treść wiadomości..." />
              {quickChannel === 'sms' && (
                <p className="text-xs text-muted-foreground">Znaki SMS: {quickBody.length}</p>
              )}
            </div>

            <div className="rounded-md border p-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Podgląd</p>
              <p className="text-sm line-clamp-3">{quickBody || 'Brak treści'}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsQuickDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="button" onClick={handleQuickSend} disabled={isQuickSending || !salonId}>
              {isQuickSending ? 'Wysyłanie...' : 'Wyślij'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historia komunikacji</DialogTitle>
            <DialogDescription>
              {historyClient ? `Ostatnie wiadomości klienta: ${historyClient.full_name}` : 'Historia wiadomości klienta'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
            {clientHistoryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Ładowanie historii...</p>
            ) : clientHistoryQuery.isError ? (
              <p className="text-sm text-destructive">
                {clientHistoryQuery.error instanceof Error
                  ? clientHistoryQuery.error.message
                  : 'Nie udało się pobrać historii komunikacji'}
              </p>
            ) : clientHistoryQuery.data?.logs?.length ? (
              clientHistoryQuery.data.logs.map((log) => (
                <div key={log.id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{log.channel.toUpperCase()}</Badge>
                      <Badge
                        variant={
                          log.status === 'failed' || log.status === 'bounced'
                            ? 'destructive'
                            : log.status === 'delivered'
                              ? 'success'
                              : log.status === 'pending'
                                ? 'secondary'
                                : 'default'
                        }
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pl-PL')}</span>
                  </div>
                  {log.subject ? <p className="text-sm font-medium truncate">{log.subject}</p> : null}
                  <p className="text-sm text-muted-foreground line-clamp-2">{log.body}</p>
                  {log.crm_campaigns?.name ? (
                    <p className="text-xs text-muted-foreground">Kampania: {log.crm_campaigns.name}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Brak wiadomości dla tego klienta.</p>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={(clientHistoryQuery.data?.pagination.page || 1) <= 1 || clientHistoryQuery.isLoading}
            >
              Poprzednia
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              Strona {clientHistoryQuery.data?.pagination.page || 1} / {clientHistoryQuery.data?.pagination.totalPages || 1}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setHistoryPage((p) => {
                  const max = clientHistoryQuery.data?.pagination.totalPages || 1
                  return Math.min(max, p + 1)
                })
              }
              disabled={
                (clientHistoryQuery.data?.pagination.page || 1) >= (clientHistoryQuery.data?.pagination.totalPages || 1) ||
                clientHistoryQuery.isLoading
              }
            >
              Następna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
