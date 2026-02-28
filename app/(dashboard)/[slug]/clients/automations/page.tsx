'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'

import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  Clock,
  Mail,
  MessageSquare,
  Users,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// --- Types ---

type TriggerType = 'no_visit_days' | 'birthday' | 'after_visit' | 'visit_count'
type Channel = 'email' | 'sms' | 'both'

interface Automation {
  id: string
  name: string
  is_active: boolean
  trigger_type: TriggerType
  trigger_config: {
    days?: number
    count?: number
    offsetDays?: number
  }
  channel: Channel
  template_id: string
  last_run_at: string | null
  created_at: string
}

interface Template {
  id: string
  name: string
  channel: Channel
}

interface AutomationsResponse {
  automations: Automation[]
  meta: {
    plan: string
    activeCount: number
    activeLimit: number | null
  }
}

interface TemplatesResponse {
  templates: Template[]
}

// --- Schema ---

const automationSchema = z.object({
  name: z.string().min(2, 'Minimum 2 znaki').max(150),
  triggerType: z.enum(['no_visit_days', 'birthday', 'after_visit', 'visit_count']),
  days: z.coerce.number().int().min(0).max(3650).optional(),
  count: z.coerce.number().int().min(1).max(10000).optional(),
  offsetDays: z.coerce.number().int().min(-31).max(31).optional(),
  channel: z.enum(['email', 'sms', 'both']),
  templateId: z.string().uuid('Wybierz szablon'),
  isActive: z.boolean().default(true),
})

type AutomationFormValues = z.infer<typeof automationSchema>

// --- Helpers ---

const TriggerLabelMap: Record<TriggerType, string> = {
  no_visit_days: 'Brak wizyty od N dni',
  after_visit: 'Po wizycie',
  birthday: 'Urodziny',
  visit_count: 'Po N wizytach',
}

export default function AutomationsPage() {
  const params = useParams()
  const slug = params.slug as string
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)

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

  const { data: automationsData, isLoading: isLoadingAutomations, error: automationsError } = useQuery<AutomationsResponse>({
    queryKey: ['crm-automations', salonId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/automations?salonId=${salonId}`)
      if (res.status === 403) {
        const data = await res.json()
        throw Object.assign(new Error(data?.message ?? 'Forbidden'), { status: 403, ...data })
      }
      if (!res.ok) throw new Error('Błąd pobierania automatyzacji')
      return res.json()
    },
    enabled: !!salonId,
    retry: false,
  })

  const { data: templatesData } = useQuery<TemplatesResponse>({
    queryKey: ['crm-templates', salonId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/templates?salonId=${salonId}`)
      if (!res.ok) throw new Error('Błąd pobierania szablonów')
      return res.json()
    },
    enabled: !!salonId,
  })

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch('/api/crm/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, salonId }),
      })
      if (res.status === 409) throw new Error('LIMIT_REACHED')
      if (!res.ok) throw new Error('Błąd zapisu')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Automatyzacja utworzona pomyślnie')
      queryClient.invalidateQueries({ queryKey: ['crm-automations', salonId] })
      setIsDialogOpen(false)
    },
    onError: (err: any) => {
      if (err.message === 'LIMIT_REACHED') {
        toast.error('Osiągnięto limit aktywnych automatyzacji')
      } else {
        toast.error('Wystąpił błąd podczas tworzenia automatyzacji')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      const res = await fetch(`/api/crm/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, salonId }),
      })
      if (res.status === 409) throw new Error('LIMIT_REACHED')
      if (!res.ok) throw new Error('Błąd aktualizacji')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Zmiany zostały zapisane')
      queryClient.invalidateQueries({ queryKey: ['crm-automations', salonId] })
      setIsDialogOpen(false)
    },
    onError: (err: any) => {
      if (err.message === 'LIMIT_REACHED') {
        toast.error('Osiągnięto limit aktywnych automatyzacji')
      } else {
        toast.error('Wystąpił błąd podczas aktualizacji')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/automations/${id}?salonId=${salonId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Błąd usuwania')
    },
    onSuccess: () => {
      toast.success('Automatyzacja została usunięta')
      queryClient.invalidateQueries({ queryKey: ['crm-automations', salonId] })
    },
    onError: () => toast.error('Wystąpił błąd podczas usuwania'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/crm/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive, salonId }),
      })
      if (res.status === 409) throw new Error('LIMIT_REACHED')
      if (!res.ok) throw new Error('Błąd zmiany statusu')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-automations', salonId] })
    },
    onError: (err: any) => {
      if (err.message === 'LIMIT_REACHED') {
        toast.error('Osiągnięto limit aktywnych automatyzacji')
      } else {
        toast.error('Błąd przełączania statusu')
      }
    },
  })

  const form = useForm<AutomationFormValues>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      name: '',
      triggerType: 'no_visit_days',
      days: 30,
      count: 5,
      offsetDays: 0,
      channel: 'sms',
      templateId: '',
      isActive: true,
    },
  })

  const watchTriggerType = form.watch('triggerType')
  const watchChannel = form.watch('channel')

  const handleOpenDialog = (automation?: Automation) => {
    if (automation) {
      setEditingAutomation(automation)
      form.reset({
        name: automation.name,
        triggerType: automation.trigger_type,
        days: automation.trigger_config.days,
        count: automation.trigger_config.count,
        offsetDays: automation.trigger_config.offsetDays,
        channel: automation.channel,
        templateId: automation.template_id,
        isActive: automation.is_active,
      })
    } else {
      setEditingAutomation(null)
      form.reset({
        name: '',
        triggerType: 'no_visit_days',
        days: 30,
        count: 5,
        offsetDays: 0,
        channel: 'sms',
        templateId: '',
        isActive: true,
      })
    }
    setIsDialogOpen(true)
  }

  const onSubmit = (values: AutomationFormValues) => {
    const triggerConfig: Record<string, number> = {}
    if (values.triggerType === 'no_visit_days' || values.triggerType === 'after_visit') {
      if (values.days !== undefined) triggerConfig.days = values.days
    } else if (values.triggerType === 'birthday') {
      if (values.offsetDays !== undefined) triggerConfig.offsetDays = values.offsetDays
    } else if (values.triggerType === 'visit_count') {
      if (values.count !== undefined) triggerConfig.count = values.count
    }

    const payload = {
      name: values.name,
      isActive: values.isActive,
      triggerType: values.triggerType,
      triggerConfig,
      channel: values.channel,
      templateId: values.templateId,
    }

    if (editingAutomation) {
      updateMutation.mutate({ id: editingAutomation.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const getTriggerDescription = (automation: Automation) => {
    const config = automation.trigger_config
    switch (automation.trigger_type) {
      case 'no_visit_days':
        return `Brak wizyty od ${config.days} dni`
      case 'after_visit':
        return `Po wizycie (${config.days} dni)`
      case 'birthday':
        return `Urodziny (offset: ${(config.offsetDays ?? 0) > 0 ? '+' : ''}${config.offsetDays ?? 0} dni)`
      case 'visit_count':
        return `Po ${config.count} wizytach`
      default:
        return '-'
    }
  }

  const filteredTemplates = (templatesData?.templates ?? []).filter((t) =>
    watchChannel === 'both' ? true : t.channel === watchChannel || t.channel === 'both'
  )

  // 403 locked state
  if (automationsError && (automationsError as any).status === 403) {
    const err = automationsError as any
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-0 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Automatyzacje</h1>
          <p className="text-muted-foreground">Twórz oparte na zdarzeniach automatyzacje CRM dla utrzymania klientów.</p>
        </div>
        <Card className="border-none shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="bg-amber-100 p-4 rounded-full text-amber-600">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Funkcja niedostępna w obecnym planie</h2>
              <p className="text-muted-foreground max-w-md">
                {err.error || 'Automatyzacje CRM wymagają planu Professional lub wyższego.'}
              </p>
            </div>
            <Button asChild className="gradient-button">
              <Link href={err.upgradeUrl || `/${slug}/billing`}>Ulepsz plan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Automatyzacje</h1>
          <p className="text-muted-foreground">
            Twórz oparte na zdarzeniach automatyzacje CRM dla utrzymania klientów.
          </p>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          disabled={isLoadingAutomations}
          className="gradient-button shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nowa automatyzacja
        </Button>
      </div>

      {/* Meta Bar */}
      {automationsData && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="bg-white/50 px-3 py-1">
            Plan: <span className="font-bold ml-1 uppercase">{automationsData.meta.plan}</span>
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Aktywne: {automationsData.meta.activeCount} /{' '}
            {automationsData.meta.activeLimit ?? 'Bez limitu'}
          </Badge>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoadingAutomations ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-none shadow-sm h-48 animate-pulse">
              <CardContent className="h-full bg-muted/20 rounded-xl" />
            </Card>
          ))
        ) : !automationsData?.automations.length ? (
          <Card className="col-span-full border-none shadow-sm glass">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-primary/10 p-5 rounded-full text-primary mb-4">
                <Zap size={40} />
              </div>
              <h3 className="text-xl font-semibold mb-2">Brak automatyzacji</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Stwórz pierwszą automatyzację, aby automatycznie wysyłać wiadomości do klientów i zwiększać powracalność.
              </p>
              <Button variant="outline" onClick={() => handleOpenDialog()}>
                Utwórz pierwszą
              </Button>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {automationsData.automations.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card
                  className={cn(
                    'border-none shadow-sm hover:shadow-md transition-shadow',
                    !item.is_active && 'opacity-60'
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold line-clamp-1 flex-1">
                        {item.name}
                      </CardTitle>
                      {item.channel === 'email' && (
                        <Badge className="bg-blue-100 text-blue-700 border-none shrink-0">
                          <Mail className="h-3 w-3 mr-1" />
                          Email
                        </Badge>
                      )}
                      {item.channel === 'sms' && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-none shrink-0">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          SMS
                        </Badge>
                      )}
                      {item.channel === 'both' && (
                        <Badge className="bg-purple-100 text-purple-700 border-none shrink-0">
                          <Zap className="h-3 w-3 mr-1" />
                          Oba
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-50 p-2 rounded-lg">
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                      {getTriggerDescription(item)}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CheckCircle2
                          className={cn(
                            'h-3.5 w-3.5',
                            item.last_run_at ? 'text-emerald-500' : 'text-gray-300'
                          )}
                        />
                        {item.last_run_at
                          ? new Date(item.last_run_at).toLocaleDateString('pl-PL')
                          : 'Nigdy nie uruchomiono'}
                      </div>
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: item.id, isActive: checked })
                        }
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => handleOpenDialog(item)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edytuj
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('Czy na pewno chcesz usunąć tę automatyzację?')) {
                            deleteMutation.mutate(item.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation ? 'Edytuj automatyzację' : 'Nowa automatyzacja'}
            </DialogTitle>
            <DialogDescription>
              Skonfiguruj parametry automatyzacji CRM dla Twojego salonu.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-4">
            {/* Nazwa */}
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa automatyzacji</Label>
              <Input
                id="name"
                placeholder="np. Przypomnienie o powrocie"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            {/* Trigger Type */}
            <div className="space-y-2">
              <Label>Typ wyzwalacza</Label>
              <Select
                value={watchTriggerType}
                onValueChange={(val: TriggerType) => form.setValue('triggerType', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz wyzwalacz" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TriggerLabelMap) as [TriggerType, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic config field */}
            {(watchTriggerType === 'no_visit_days' || watchTriggerType === 'after_visit') && (
              <div className="space-y-2">
                <Label htmlFor="days">
                  {watchTriggerType === 'no_visit_days' ? 'Dni bez wizyty' : 'Dni po wizycie'}
                </Label>
                <Input type="number" id="days" min={0} max={3650} {...form.register('days')} />
                {form.formState.errors.days && (
                  <p className="text-xs text-red-500">{form.formState.errors.days.message}</p>
                )}
              </div>
            )}

            {watchTriggerType === 'birthday' && (
              <div className="space-y-2">
                <Label htmlFor="offsetDays">Offset dni (np. -1 = dzień przed urodzinami)</Label>
                <Input
                  type="number"
                  id="offsetDays"
                  min={-31}
                  max={31}
                  {...form.register('offsetDays')}
                />
                {form.formState.errors.offsetDays && (
                  <p className="text-xs text-red-500">{form.formState.errors.offsetDays.message}</p>
                )}
              </div>
            )}

            {watchTriggerType === 'visit_count' && (
              <div className="space-y-2">
                <Label htmlFor="count">Liczba wizyt</Label>
                <Input type="number" id="count" min={1} max={10000} {...form.register('count')} />
                {form.formState.errors.count && (
                  <p className="text-xs text-red-500">{form.formState.errors.count.message}</p>
                )}
              </div>
            )}

            {/* Channel */}
            <div className="space-y-2">
              <Label>Kanał komunikacji</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['email', 'sms', 'both'] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={watchChannel === c ? 'default' : 'outline'}
                    className="h-9 capitalize"
                    onClick={() => {
                      form.setValue('channel', c)
                      form.setValue('templateId', '')
                    }}
                  >
                    {c === 'both' ? 'Oba' : c.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Template */}
            <div className="space-y-2">
              <Label>Szablon wiadomości</Label>
              <Select
                value={form.watch('templateId')}
                onValueChange={(val) => form.setValue('templateId', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz szablon" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTemplates.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Brak dostępnych szablonów
                    </SelectItem>
                  ) : (
                    filteredTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.templateId && (
                <p className="text-xs text-red-500">{form.formState.errors.templateId.message}</p>
              )}
            </div>

            {/* Active */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
              <div>
                <p className="text-sm font-medium">Aktywna</p>
                <p className="text-xs text-muted-foreground">Automatyzacja będzie uruchamiana cyklicznie</p>
              </div>
              <Switch
                checked={form.watch('isActive')}
                onCheckedChange={(val) => form.setValue('isActive', val)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" className="gradient-button" disabled={isMutating}>
                {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Zapisz automatyzację
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
