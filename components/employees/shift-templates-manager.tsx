'use client'

import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useShiftTemplates } from '@/hooks/use-shift-templates'

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

type TemplateFormState = {
  name: string
  start_time: string
  end_time: string
  color: string
}

const DEFAULT_FORM: TemplateFormState = {
  name: '',
  start_time: '09:00',
  end_time: '17:00',
  color: PRESET_COLORS[0],
}

function normalizeTime(value: string): string {
  return value.slice(0, 5)
}

export function ShiftTemplatesManager(): JSX.Element {
  const { templates, isLoading, error, createTemplate, updateTemplate, deleteTemplate } = useShiftTemplates()

  const [isAdding, setIsAdding] = useState(false)
  const [addForm, setAddForm] = useState<TemplateFormState>(DEFAULT_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TemplateFormState>(DEFAULT_FORM)

  const [isCreating, setIsCreating] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeTemplates = useMemo(() => {
    return templates.filter((template) => template.is_active)
  }, [templates])

  const resetAddForm = (): void => {
    setAddForm(DEFAULT_FORM)
  }

  const handleStartAdd = (): void => {
    setIsAdding(true)
    resetAddForm()
  }

  const handleCancelAdd = (): void => {
    setIsAdding(false)
    resetAddForm()
  }

  const handleCreate = async (): Promise<void> => {
    const payload = {
      name: addForm.name.trim(),
      start_time: normalizeTime(addForm.start_time),
      end_time: normalizeTime(addForm.end_time),
      color: addForm.color,
    }

    if (!payload.name || !payload.start_time || !payload.end_time || payload.start_time >= payload.end_time) {
      return
    }

    setIsCreating(true)
    try {
      await createTemplate(payload)
      setIsAdding(false)
      resetAddForm()
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartEdit = (templateId: string): void => {
    const template = activeTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }

    setEditingId(templateId)
    setEditForm({
      name: template.name,
      start_time: normalizeTime(template.start_time),
      end_time: normalizeTime(template.end_time),
      color: template.color,
    })
  }

  const handleCancelEdit = (): void => {
    setEditingId(null)
    setEditForm(DEFAULT_FORM)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingId) {
      return
    }

    const payload = {
      name: editForm.name.trim(),
      start_time: normalizeTime(editForm.start_time),
      end_time: normalizeTime(editForm.end_time),
      color: editForm.color,
    }

    if (!payload.name || !payload.start_time || !payload.end_time || payload.start_time >= payload.end_time) {
      return
    }

    setIsSavingEdit(true)
    try {
      await updateTemplate(editingId, payload)
      setEditingId(null)
      setEditForm(DEFAULT_FORM)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async (templateId: string): Promise<void> => {
    setDeletingId(templateId)
    try {
      await deleteTemplate(templateId)
      if (editingId === templateId) {
        setEditingId(null)
        setEditForm(DEFAULT_FORM)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const renderForm = (
    form: TemplateFormState,
    onChange: (next: TemplateFormState) => void,
    onSave: () => void,
    onCancel: () => void,
    isPending: boolean
  ): JSX.Element => {
    return (
      <div className="rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="template-name">Nazwa</Label>
            <Input
              id="template-name"
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              placeholder="np. Ranna zmiana"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-start">Start</Label>
            <Input
              id="template-start"
              type="time"
              value={normalizeTime(form.start_time)}
              onChange={(event) => onChange({ ...form, start_time: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-end">Koniec</Label>
            <Input
              id="template-end"
              type="time"
              value={normalizeTime(form.end_time)}
              onChange={(event) => onChange({ ...form, end_time: event.target.value })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Kolor</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange({ ...form, color })}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    backgroundColor: color,
                    borderColor: form.color === color ? 'hsl(var(--foreground))' : 'transparent',
                  }}
                  aria-label={`Wybierz kolor ${color}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={onSave} disabled={isPending}>
            Zapisz
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Anuluj
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Szablony zmian</h3>
        {!isAdding ? (
          <Button type="button" variant="outline" onClick={handleStartAdd}>
            Dodaj szablon
          </Button>
        ) : null}
      </div>

      {isAdding
        ? renderForm(
            addForm,
            (next) => setAddForm(next),
            () => {
              void handleCreate()
            },
            handleCancelAdd,
            isCreating
          )
        : null}

      {isLoading ? <p className="text-sm text-muted-foreground">Ladowanie szablonow...</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      {!isLoading && activeTemplates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak aktywnych szablonow zmian.</p>
      ) : null}

      <div className="space-y-2">
        {activeTemplates.map((template) => (
          <div key={template.id} className="rounded-lg border p-3">
            {editingId === template.id
              ? renderForm(
                  editForm,
                  (next) => setEditForm(next),
                  () => {
                    void handleSaveEdit()
                  },
                  handleCancelEdit,
                  isSavingEdit
                )
              : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: template.color }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{template.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {normalizeTime(template.start_time)} - {normalizeTime(template.end_time)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Badge variant="outline">Aktywny</Badge>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Edytuj szablon ${template.name}`}
                      onClick={() => handleStartEdit(template.id)}
                      disabled={deletingId === template.id}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Usun szablon ${template.name}`}
                      onClick={() => {
                        void handleDelete(template.id)
                      }}
                      disabled={deletingId === template.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  )
}
