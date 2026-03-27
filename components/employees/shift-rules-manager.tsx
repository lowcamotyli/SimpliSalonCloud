'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ShiftRulesManagerProps = {
  employeeId: string
}

type RuleType = 'fixed' | 'alternating'

type ShiftTemplate = {
  id: string
  name: string
}

type ShiftRule = {
  id: string
  name: string
  rule_type: RuleType
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
  created_at: string
  template_a: {
    name: string
    color: string
  } | null
  template_b: {
    name: string
    color: string
  } | null
}

type ShiftRulesResponse = {
  data?: ShiftRule[]
  error?: string
}

type ShiftRuleResponse = {
  data?: ShiftRule
  error?: string
}

type ShiftTemplatesResponse = {
  templates?: ShiftTemplate[]
  error?: string
}

type ApiError = {
  message?: string
  error?: string
}

type RuleFormState = {
  name: string
  ruleType: RuleType
  templateAId: string
  templateBId: string
  daysOfWeek: Record<number, boolean>
  referenceWeek: string
}

const DAY_OPTIONS = [
  { label: 'Pon', value: 0, defaultChecked: true },
  { label: 'Wt', value: 1, defaultChecked: true },
  { label: '\Śr', value: 2, defaultChecked: true },
  { label: 'Czw', value: 3, defaultChecked: true },
  { label: 'Pt', value: 4, defaultChecked: true },
  { label: 'Sob', value: 5, defaultChecked: false },
  { label: 'Nie', value: 6, defaultChecked: false },
] as const

function createDefaultDays(): Record<number, boolean> {
  return DAY_OPTIONS.reduce<Record<number, boolean>>((accumulator, day) => {
    accumulator[day.value] = day.defaultChecked
    return accumulator
  }, {})
}

function createDefaultFormState(): RuleFormState {
  return {
    name: '',
    ruleType: 'fixed',
    templateAId: '',
    templateBId: '',
    daysOfWeek: createDefaultDays(),
    referenceWeek: '',
  }
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as ApiError
    return data.message || data.error || fallback
  } catch {
    return fallback
  }
}

function getSelectedDays(daysOfWeek: Record<number, boolean>): number[] {
  return DAY_OPTIONS
    .filter((day) => daysOfWeek[day.value])
    .map((day) => day.value)
}

function getRuleTypeLabel(ruleType: RuleType): string {
  return ruleType === 'fixed' ? 'Sta\ła' : 'Naprzemienna'
}

function getWeekInputValue(dateValue: string | null): string {
  return dateValue ?? ''
}

export function ShiftRulesManager({ employeeId }: ShiftRulesManagerProps): ReactElement {
  const [rules, setRules] = useState<ShiftRule[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [isLoadingRules, setIsLoadingRules] = useState(true)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [form, setForm] = useState<RuleFormState>(() => createDefaultFormState())

  const activeRules = useMemo(() => rules.filter((rule) => rule.is_active), [rules])

  const resetForm = (): void => {
    setForm(createDefaultFormState())
  }

  const fetchRules = async (): Promise<void> => {
    setIsLoadingRules(true)
    setRulesError(null)

    try {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie pobrac zasad.'))
      }

      const payload = (await response.json()) as ShiftRulesResponse
      setRules(payload.data ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac zasad.'
      setRules([])
      setRulesError(message)
    } finally {
      setIsLoadingRules(false)
    }
  }

  const fetchTemplates = async (): Promise<void> => {
    setIsLoadingTemplates(true)
    setTemplatesError(null)

    try {
      const response = await fetch('/api/shift-templates', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie pobrac szablonow zmian.'))
      }

      const payload = (await response.json()) as ShiftTemplatesResponse
      setTemplates(payload.templates ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac szablonow zmian.'
      setTemplates([])
      setTemplatesError(message)
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  useEffect(() => {
    void fetchRules()
    void fetchTemplates()
  }, [employeeId])

  const handleStartAdd = (): void => {
    resetForm()
    setIsAdding(true)
  }

  const handleCancelAdd = (): void => {
    resetForm()
    setIsAdding(false)
  }

  const handleToggleDay = (dayValue: number, checked: boolean): void => {
    setForm((current) => ({
      ...current,
      daysOfWeek: {
        ...current.daysOfWeek,
        [dayValue]: checked,
      },
    }))
  }

  const handleSubmit = async (): Promise<void> => {
    const selectedDays = getSelectedDays(form.daysOfWeek)

    if (!form.name.trim()) {
      toast.error('Podaj nazwe zasady.')
      return
    }

    if (!form.templateAId) {
      toast.error('Wybierz zmiane A.')
      return
    }

    if (selectedDays.length === 0) {
      toast.error('Wybierz przynajmniej jeden dzien.')
      return
    }

    if (form.ruleType === 'alternating' && !form.templateBId) {
      toast.error('Wybierz zmiane B.')
      return
    }

    if (form.ruleType === 'alternating' && !form.referenceWeek) {
      toast.error('Wybierz tydzien odniesienia.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name.trim(),
          rule_type: form.ruleType,
          template_a_id: form.templateAId,
          template_b_id: form.ruleType === 'alternating' ? form.templateBId : undefined,
          days_of_week: selectedDays,
          reference_week: form.ruleType === 'alternating' ? form.referenceWeek : undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie zapisac zasady.'))
      }

      const payload = (await response.json()) as ShiftRuleResponse

      if (payload.data) {
        setRules((current) => [...current, payload.data as ShiftRule])
      }

      toast.success('Zasada zostala zapisana.')
      handleCancelAdd()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac zasady.'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (ruleId: string): Promise<void> => {
    const confirmed = window.confirm('Usunac te zasade?')

    if (!confirmed) {
      return
    }

    setDeletingRuleId(ruleId)

    try {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules/${ruleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie usunac zasady.'))
      }

      setRules((current) => current.filter((rule) => rule.id !== ruleId))
      toast.success('Zasada zostala usunieta.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie usunac zasady.'
      toast.error(message)
    } finally {
      setDeletingRuleId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Zasady automatyczne</h3>
        {!isAdding ? (
          <Button type="button" variant="outline" onClick={handleStartAdd}>
            Dodaj zasad\ę
          </Button>
        ) : null}
      </div>

      {isAdding ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Nazwa</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="np. Grafik tygodniowy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-type">Typ zasady</Label>
            <Select
              value={form.ruleType}
              onValueChange={(value: RuleType) =>
                setForm((current) => ({
                  ...current,
                  ruleType: value,
                  templateBId: value === 'alternating' ? current.templateBId : '',
                  referenceWeek: value === 'alternating' ? current.referenceWeek : '',
                }))
              }
            >
              <SelectTrigger id="rule-type">
                <SelectValue placeholder="Wybierz typ zasady" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Sta\ła zmiana</SelectItem>
                <SelectItem value="alternating">Naprzemienna co tydzie\ń</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-template-a">Zmiana A</Label>
            <Select
              value={form.templateAId}
              onValueChange={(value: string) => setForm((current) => ({ ...current, templateAId: value }))}
            >
              <SelectTrigger id="rule-template-a">
                <SelectValue placeholder={isLoadingTemplates ? 'Ladowanie...' : 'Wybierz szablon'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.ruleType === 'alternating' ? (
            <div className="space-y-2">
              <Label htmlFor="rule-template-b">Zmiana B</Label>
              <Select
                value={form.templateBId}
                onValueChange={(value: string) => setForm((current) => ({ ...current, templateBId: value }))}
              >
                <SelectTrigger id="rule-template-b">
                  <SelectValue placeholder={isLoadingTemplates ? 'Ladowanie...' : 'Wybierz szablon'} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Dni</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DAY_OPTIONS.map((day) => (
                <label key={day.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.daysOfWeek[day.value] ?? false}
                    onCheckedChange={(checked) => handleToggleDay(day.value, checked === true)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          {form.ruleType === 'alternating' ? (
            <div className="space-y-2">
              <Label htmlFor="reference-week">Tydzie\ń A (punkt odniesienia)</Label>
              <Input
                id="reference-week"
                type="week"
                value={getWeekInputValue(form.referenceWeek)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    referenceWeek: event.target.value,
                  }))
                }
              />
            </div>
          ) : null}

          {templatesError ? <p className="text-sm text-destructive">{templatesError}</p> : null}

          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving}>
              Zapisz
            </Button>
            <Button type="button" variant="outline" onClick={handleCancelAdd} disabled={isSaving}>
              Anuluj
            </Button>
          </div>
        </div>
      ) : null}

      {isLoadingRules ? <p className="text-sm text-muted-foreground">Ladowanie zasad...</p> : null}
      {rulesError ? <p className="text-sm text-destructive">{rulesError}</p> : null}

      {!isLoadingRules && !rulesError && activeRules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak aktywnych zasad automatycznych.</p>
      ) : null}

      <div className="space-y-2">
        {activeRules.map((rule) => (
          <div key={rule.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  <Badge variant="secondary">{getRuleTypeLabel(rule.rule_type)}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {DAY_OPTIONS.filter((day) => rule.days_of_week.includes(day.value)).map((day) => (
                    <Badge key={day.value} variant="outline">
                      {day.label}
                    </Badge>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground">
                  {rule.rule_type === 'fixed'
                    ? `Zmiana: ${rule.template_a?.name ?? 'Brak szablonu'}`
                    : `A: ${rule.template_a?.name ?? 'Brak'} / B: ${rule.template_b?.name ?? 'Brak'}`}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label={`Edytuj zasade ${rule.name}`} disabled>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Usun zasade ${rule.name}`}
                  onClick={() => {
                    void handleDelete(rule.id)
                  }}
                  disabled={deletingRuleId === rule.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
