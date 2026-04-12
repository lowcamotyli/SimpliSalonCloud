'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

interface BulkAddonDialogProps {
  serviceIds: string[]
  mode: 'assign' | 'remove'
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface AddonTemplate {
  id: string
  name: string
  price_delta: number
  duration_delta: number
}

interface AddonTemplatesResponse {
  templates?: AddonTemplate[]
}

function formatPriceDelta(value: number) {
  if (value === 0) {
    return '0 zl'
  }

  const sign = value > 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(2)} zl`
}

function formatDurationDelta(value: number) {
  if (value === 0) {
    return '0 min'
  }

  const sign = value > 0 ? '+' : '-'
  return `${sign}${Math.abs(value)} min`
}

export function BulkAddonDialog({
  serviceIds,
  mode,
  open,
  onClose,
  onSuccess,
}: BulkAddonDialogProps) {
  const [templates, setTemplates] = useState<AddonTemplate[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setTemplates([])
      setSelectedTemplateIds(new Set())
      setLoading(false)
      return
    }

    let cancelled = false

    const loadTemplates = async () => {
      setLoading(true)
      setSelectedTemplateIds(new Set())

      try {
        const response = await fetch('/api/addon-templates')

        if (!response.ok) {
          throw new Error('Nie udalo sie pobrac szablonow')
        }

        const data = (await response.json()) as AddonTemplatesResponse

        if (!cancelled) {
          setTemplates(Array.isArray(data.templates) ? data.templates : [])
        }
      } catch {
        if (!cancelled) {
          toast.error('Nie udalo sie pobrac szablonow dodatkow')
          setTemplates([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadTemplates()

    return () => {
      cancelled = true
    }
  }, [open])

  const toggleTemplate = (templateId: string, checked: boolean) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev)

      if (checked) {
        next.add(templateId)
      } else {
        next.delete(templateId)
      }

      return next
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    try {
      const response = await fetch('/api/services/batch/addons', {
        method: mode === 'assign' ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_ids: serviceIds,
          template_ids: Array.from(selectedTemplateIds),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || 'Nie udalo sie zapisac zmian')
      }

      const data = (await response.json()) as {
        assigned_count?: number
        removed_count?: number
      }

      if (mode === 'assign') {
        toast.success(
          `Przypisano ${data.assigned_count ?? 0} dodatkow do ${serviceIds.length} uslug`
        )
      } else {
        toast.success(
          `Usunieto ${data.removed_count ?? 0} dodatkow z ${serviceIds.length} uslug`
        )
      }

      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nie udalo sie zapisac zmian')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'assign' ? 'Przypisz dodatki do uslug' : 'Usun dodatki z uslug'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'assign'
              ? 'Wybierz szablony dodatkow, ktore chcesz przypisac do zaznaczonych uslug.'
              : 'Wybierz szablony dodatkow, ktore chcesz usunac z zaznaczonych uslug.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Brak szablonow. Dodaj szablony w sekcji Uslugi &gt; Szablony Dodatkow.
          </div>
        ) : (
          <ScrollArea className="h-72 rounded-md border p-2">
            <div className="space-y-2">
              {templates.map((template) => {
                const checkboxId = `bulk-addon-template-${template.id}`

                return (
                  <label
                    key={template.id}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={selectedTemplateIds.has(template.id)}
                      onCheckedChange={(checked) =>
                        toggleTemplate(template.id, checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium leading-none">{template.name}</div>
                      <p className="text-sm text-muted-foreground">
                        {formatPriceDelta(template.price_delta)} •{' '}
                        {formatDurationDelta(template.duration_delta)}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || submitting || selectedTemplateIds.size === 0}
          >
            {submitting
              ? 'Zapisywanie...'
              : mode === 'assign'
                ? 'Przypisz dodatki'
                : 'Usun dodatki'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
