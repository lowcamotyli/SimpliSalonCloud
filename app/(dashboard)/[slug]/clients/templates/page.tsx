'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type TemplateChannel = 'email' | 'sms' | 'both'

type Template = {
  id: string
  name: string
  channel: TemplateChannel
  subject: string | null
  body: string
  updated_at: string
}

const CHANNEL_BADGE: Record<TemplateChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  both: 'Email + SMS',
}

export default function ClientTemplatesPage() {
  const params = useParams()
  const slug = params.slug as string

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<TemplateChannel>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const templatesQuery = useQuery<{ templates: Template[]; locked?: boolean; reason?: string; upgradeUrl?: string }>({
    queryKey: ['crm-templates', salonId],
    enabled: !!salonId,
    queryFn: async () => {
      const res = await fetch(`/api/crm/templates?salonId=${salonId}`)
      const payload = await res.json().catch(() => ({}))
      if (res.status === 403) {
        return {
          templates: [],
          locked: true,
          reason: payload?.error || 'Szablony CRM są dostępne od planu Professional',
          upgradeUrl: payload?.upgradeUrl,
        }
      }
      if (!res.ok) throw new Error(payload?.error || 'Nie udało się pobrać szablonów')
      return { templates: payload.templates || [] }
    },
  })

  const smsLength = useMemo(() => body.length, [body])

  const resetForm = () => {
    setSelectedTemplate(null)
    setName('')
    setChannel('email')
    setSubject('')
    setBody('')
  }

  const openCreate = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEdit = (template: Template) => {
    setSelectedTemplate(template)
    setName(template.name)
    setChannel(template.channel)
    setSubject(template.subject || '')
    setBody(template.body || '')
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!salonId) return
    if (!name.trim() || !body.trim()) {
      toast.error('Uzupełnij nazwę i treść')
      return
    }
    if ((channel === 'email' || channel === 'both') && !subject.trim()) {
      toast.error('Uzupełnij temat dla szablonu email')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        salonId,
        name: name.trim(),
        channel,
        subject: subject.trim() || null,
        body: body.trim(),
      }

      const res = await fetch(selectedTemplate ? `/api/crm/templates/${selectedTemplate.id}` : '/api/crm/templates', {
        method: selectedTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const responsePayload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(responsePayload?.error || 'Nie udało się zapisać szablonu')
      }

      toast.success(selectedTemplate ? 'Szablon zaktualizowany' : 'Szablon utworzony')
      await templatesQuery.refetch()
      setIsDialogOpen(false)
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Błąd zapisu')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!salonId) return
    if (!confirm('Czy na pewno chcesz usunąć ten szablon?')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/crm/templates/${templateId}?salonId=${salonId}`, { method: 'DELETE' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || 'Nie udało się usunąć szablonu')
      toast.success('Szablon usunięty')
      await templatesQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Błąd usuwania')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-0 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Szablony wiadomości</h1>
          <p className="text-muted-foreground">Zarządzaj szablonami dla szybkiej komunikacji z klientami</p>
        </div>
        <Button onClick={openCreate} disabled={!salonId || !!templatesQuery.data?.locked}>Nowy szablon</Button>
      </div>

      {templatesQuery.data?.locked ? (
        <Card>
          <CardHeader>
            <CardTitle>Funkcja niedostępna w obecnym planie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{templatesQuery.data.reason || 'Szablony CRM wymagają planu Professional lub wyższego.'}</p>
            <Link href={templatesQuery.data.upgradeUrl || `/${slug}/billing/upgrade`}>
              <Button>Przejdź do upgrade</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!templatesQuery.data?.locked && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {templatesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Ładowanie szablonów...</p>
            ) : templatesQuery.isError ? (
              <p className="text-sm text-destructive">
                {templatesQuery.error instanceof Error
                  ? templatesQuery.error.message
                  : 'Nie udało się pobrać szablonów'}
              </p>
            ) : templatesQuery.data?.templates?.length ? (
              templatesQuery.data.templates.map((template) => (
                <div key={template.id} className="rounded-lg border p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{template.name}</p>
                      <Badge variant="outline">{CHANNEL_BADGE[template.channel]}</Badge>
                    </div>
                    {(template.channel === 'email' || template.channel === 'both') && template.subject ? (
                      <p className="text-sm text-muted-foreground truncate">Temat: {template.subject}</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground line-clamp-2">{template.body}</p>
                    <p className="text-xs text-muted-foreground">Aktualizacja: {new Date(template.updated_at).toLocaleString('pl-PL')}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(template)}>Edytuj</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(template.id)} disabled={isDeleting}>Usuń</Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Brak szablonów. Utwórz pierwszy szablon.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? 'Edycja szablonu' : 'Nowy szablon'}</DialogTitle>
            <DialogDescription>Ustaw kanał i treść wiadomości.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Np. Przypomnienie o wizycie" />
            </div>

            <div className="space-y-2">
              <Label>Kanał</Label>
              <div className="flex gap-2">
                <Button type="button" variant={channel === 'email' ? 'default' : 'outline'} onClick={() => setChannel('email')}>Email</Button>
                <Button type="button" variant={channel === 'sms' ? 'default' : 'outline'} onClick={() => setChannel('sms')}>SMS</Button>
                <Button type="button" variant={channel === 'both' ? 'default' : 'outline'} onClick={() => setChannel('both')}>Oba</Button>
              </div>
            </div>

            {(channel === 'email' || channel === 'both') && (
              <div className="space-y-2">
                <Label>Temat (Email)</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Temat wiadomości" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Treść</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Treść wiadomości..." />
              {(channel === 'sms' || channel === 'both') && (
                <p className="text-xs text-muted-foreground">Licznik znaków SMS: {smsLength}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Zapisywanie...' : 'Zapisz'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

