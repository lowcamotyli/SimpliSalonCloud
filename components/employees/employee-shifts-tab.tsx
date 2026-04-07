'use client'

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type ShiftTemplate = {
  id: string
  name: string
  start_time: string
  end_time: string
  color: string
}

type EmployeeShift = {
  id: string
  employee_id: string
  shift_template_id: string | null
  date: string
  start_time: string
  end_time: string
  notes: string | null
  template?: {
    name: string
    color: string
  } | null
}

type ApiError = {
  message?: string
  error?: string
}

type EmployeeShiftsResponse = {
  shifts?: EmployeeShift[]
}

type ShiftTemplatesResponse = {
  templates?: ShiftTemplate[]
}

type EmployeeShiftsTabProps = {
  employeeId: string
}

const DAY_LABELS = ['Pon', 'Wt', 'Sr', 'Czw', 'Pt', 'Sob', 'Nie'] as const
const WEEK_APPLY_DAY_OPTIONS = [
  { label: 'Pon', index: 0, defaultChecked: true },
  { label: 'Wt', index: 1, defaultChecked: true },
  { label: '\u015Ar', index: 2, defaultChecked: true },
  { label: 'Czw', index: 3, defaultChecked: true },
  { label: 'Pt', index: 4, defaultChecked: true },
  { label: 'Sob', index: 5, defaultChecked: false },
  { label: 'Nie', index: 6, defaultChecked: false },
] as const

function formatTime(value: string): string {
  return value.slice(0, 5)
}

function getWeekDays(currentWeekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index))
}

function getDefaultWeekApplyDays(): Record<number, boolean> {
  return WEEK_APPLY_DAY_OPTIONS.reduce<Record<number, boolean>>((accumulator, day) => {
    accumulator[day.index] = day.defaultChecked
    return accumulator
  }, {})
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as ApiError
    return data.message || data.error || fallback
  } catch {
    return fallback
  }
}

function ShiftAssignDialog({
  employeeId,
  isOpen,
  selectedDate,
  templates,
  isTemplatesLoading,
  onOpenChange,
  onAssigned,
}: {
  employeeId: string
  isOpen: boolean
  selectedDate: Date | null
  templates: ShiftTemplate[]
  isTemplatesLoading: boolean
  onOpenChange: (isOpen: boolean) => void
  onAssigned: () => Promise<void>
}): ReactElement {
  const [mode, setMode] = useState<'template' | 'manual'>('template')
  const [templateId, setTemplateId] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setMode('template')
      setTemplateId('')
      setStartTime('09:00')
      setEndTime('17:00')
      setNotes('')
      setIsSaving(false)
    }
  }, [isOpen])

  const handleSubmit = async (): Promise<void> => {
    if (!selectedDate) {
      return
    }

    if (mode === 'template' && !templateId) {
      toast.error('Wybierz szablon zmiany.')
      return
    }

    if (mode === 'manual' && (!startTime || !endTime)) {
      toast.error('Podaj godzine rozpoczecia i zakonczenia.')
      return
    }

    const payload: {
      date: string
      shift_template_id?: string
      start_time?: string
      end_time?: string
      notes?: string
    } = {
      date: format(selectedDate, 'yyyy-MM-dd'),
    }

    if (mode === 'template') {
      payload.shift_template_id = templateId
    } else {
      payload.start_time = startTime
      payload.end_time = endTime
    }

    if (notes.trim().length > 0) {
      payload.notes = notes.trim()
    }

    setIsSaving(true)

    try {
      const response = await fetch(`/api/employees/${employeeId}/shifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie przypisac zmiany.'))
      }

      toast.success('Zmiana zostala przypisana.')
      onOpenChange(false)
      await onAssigned()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie przypisac zmiany.'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const formattedDate = selectedDate ? format(selectedDate, 'dd.MM.yyyy') : ''

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Przypisz zmiane</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-date">Data</Label>
            <Input id="shift-date" value={formattedDate} readOnly />
          </div>

          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as 'template' | 'manual')}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="template">Ze szablonu</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-2">
              <Label htmlFor="shift-template">Szablon</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="shift-template">
                  <SelectValue placeholder={isTemplatesLoading ? 'Ladowanie...' : 'Wybierz szablon'} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({formatTime(template.start_time)}-{formatTime(template.end_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isTemplatesLoading && templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak aktywnych szablonow zmian.</p>
              ) : null}
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="manual-start-time">Od</Label>
                  <Input
                    id="manual-start-time"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-end-time">Do</Label>
                  <Input
                    id="manual-end-time"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="shift-notes">Notatki</Label>
            <Textarea
              id="shift-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcjonalne notatki do zmiany"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Anuluj
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving}>
            {isSaving ? 'Zapisywanie...' : 'Przypisz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EmployeeShiftsTab({ employeeId }: EmployeeShiftsTabProps): ReactElement {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [shifts, setShifts] = useState<EmployeeShift[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [isLoadingShifts, setIsLoadingShifts] = useState(true)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isWeekApplyDialogOpen, setIsWeekApplyDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null)
  const [weekApplyTemplateId, setWeekApplyTemplateId] = useState('')
  const [weekApplyDays, setWeekApplyDays] = useState<Record<number, boolean>>(() => getDefaultWeekApplyDays())
  const [isApplyingWeek, setIsApplyingWeek] = useState(false)

  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart])
  const weekLabel = useMemo(() => {
    const weekEnd = addDays(currentWeekStart, 6)
    const monthYear = format(weekEnd, 'MMMM yyyy', { locale: pl })
    const formattedMonthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1)

    return `${DAY_LABELS[0]} ${format(currentWeekStart, 'd')} - ${DAY_LABELS[6]} ${format(weekEnd, 'd')} ${formattedMonthYear}`
  }, [currentWeekStart])

  const fetchShifts = useCallback(async (): Promise<void> => {
    setIsLoadingShifts(true)

    const from = format(currentWeekStart, 'yyyy-MM-dd')
    const to = format(addDays(currentWeekStart, 6), 'yyyy-MM-dd')

    try {
      const response = await fetch(`/api/employees/${employeeId}/shifts?from=${from}&to=${to}`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie pobrac zmian.'))
      }

      const data = (await response.json()) as EmployeeShiftsResponse
      setShifts(data.shifts ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac zmian.'
      toast.error(message)
      setShifts([])
    } finally {
      setIsLoadingShifts(false)
    }
  }, [currentWeekStart, employeeId])

  const fetchTemplates = useCallback(async (): Promise<void> => {
    setIsLoadingTemplates(true)

    try {
      const response = await fetch('/api/shift-templates', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie pobrac szablonow zmian.'))
      }

      const data = (await response.json()) as ShiftTemplatesResponse
      setTemplates(data.templates ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac szablonow zmian.'
      toast.error(message)
      setTemplates([])
    } finally {
      setIsLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    void fetchShifts()
  }, [fetchShifts])

  useEffect(() => {
    if (!isDialogOpen || templates.length > 0 || isLoadingTemplates) {
      return
    }

    void fetchTemplates()
  }, [fetchTemplates, isDialogOpen, isLoadingTemplates, templates.length])

  useEffect(() => {
    if (!isWeekApplyDialogOpen) {
      setWeekApplyTemplateId('')
      setWeekApplyDays(getDefaultWeekApplyDays())
      setIsApplyingWeek(false)
      return
    }

    if (templates.length > 0 || isLoadingTemplates) {
      return
    }

    void fetchTemplates()
  }, [fetchTemplates, isLoadingTemplates, isWeekApplyDialogOpen, templates.length])

  const shiftsByDate = useMemo(() => {
    return new Map(shifts.map((shift) => [shift.date, shift]))
  }, [shifts])

  const handleOpenAssignDialog = (date: Date): void => {
    setSelectedDate(date)
    setIsDialogOpen(true)
  }

  const handleAssign = async (): Promise<void> => {
    await fetchShifts()
  }

  const handleApplyToWeek = async (): Promise<void> => {
    if (!weekApplyTemplateId) {
      toast.error('Wybierz szablon zmiany.')
      return
    }

    const selectedDays = weekDays.filter((_, index) => weekApplyDays[index])

    if (selectedDays.length === 0) {
      toast.error('Wybierz przynajmniej jeden dzien.')
      return
    }

    const datesToAssign = selectedDays.filter((day) => !shiftsByDate.has(format(day, 'yyyy-MM-dd')))

    setIsApplyingWeek(true)

    try {
      await Promise.all(
        datesToAssign.map(async (day) => {
          const response = await fetch(`/api/employees/${employeeId}/shifts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              date: format(day, 'yyyy-MM-dd'),
              shift_template_id: weekApplyTemplateId,
            }),
          })

          if (!response.ok) {
            throw new Error(await getErrorMessage(response, 'Nie udalo sie przypisac zmiany.'))
          }
        })
      )

      toast.success('Zmiany zostaly przypisane.')
      setIsWeekApplyDialogOpen(false)
      await fetchShifts()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie przypisac zmian.'
      toast.error(message)
    } finally {
      setIsApplyingWeek(false)
    }
  }

  const handleDeleteShift = async (shift: EmployeeShift): Promise<void> => {
    const confirmDelete = window.confirm('Usunac te zmiane?')

    if (!confirmDelete) {
      return
    }

    setDeletingShiftId(shift.id)

    try {
      const response = await fetch(`/api/employees/${employeeId}/shifts/${shift.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Nie udalo sie usunac zmiany.'))
      }

      toast.success('Zmiana zostala usunieta.')
      await fetchShifts()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie usunac zmiany.'
      toast.error(message)
    } finally {
      setDeletingShiftId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-5">
        <div className="space-y-1">
          <CardTitle className="text-lg">Zmiany pracownika</CardTitle>
          <p className="text-sm text-muted-foreground">
            Przegladaj i przypisuj zmiany w ukladzie tygodniowym.
          </p>
        </div>

        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setCurrentWeekStart((value) => addWeeks(value, -1))}
            aria-label="Poprzedni tydzien"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-2 text-center text-sm font-semibold capitalize sm:text-base">{weekLabel}</div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setCurrentWeekStart((value) => addWeeks(value, 1))}
            aria-label="Nastepny tydzien"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsWeekApplyDialogOpen(true)}
          >
            {'Zastosuj na tydzie\u0144'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoadingShifts ? (
          <p className="text-sm text-muted-foreground">Ladowanie zmian...</p>
        ) : null}

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day, index) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const shift = shiftsByDate.get(dateKey)
            const isToday = isSameDay(day, new Date())

            return (
              <div
                key={dateKey}
                className={[
                  'flex h-[100px] flex-col items-center justify-between rounded-xl border py-2',
                  isToday ? 'ring-2 ring-primary ring-offset-2' : '',
                ].join(' ')}
              >
                <div className="flex w-full items-start justify-between gap-2 px-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {DAY_LABELS[index]}
                    </p>
                    <p className="text-2xl font-semibold leading-none">{format(day, 'd')}</p>
                  </div>
                  {isToday ? <Badge variant="secondary">Dzis</Badge> : null}
                </div>

                <div className="flex w-full flex-1 items-center justify-center px-2">
                  {shift ? (
                    <div
                      className="relative w-full rounded-lg p-1.5 text-center text-xs text-white shadow-sm"
                      style={{ backgroundColor: shift.template?.color ?? '#52525b' }}
                    >
                      <p className="truncate pr-4 text-[10px] leading-tight text-white/90">
                        {shift.template?.name ?? 'Zmiana manualna'}
                      </p>
                      <p className="truncate text-xs font-medium leading-tight">
                        {formatTime(shift.start_time)}
                        {'\u2013'}
                        {formatTime(shift.end_time)}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white/20 text-white hover:bg-white/30 hover:text-white"
                        onClick={() => void handleDeleteShift(shift)}
                        disabled={deletingShiftId === shift.id}
                        aria-label="Usun zmiane"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => handleOpenAssignDialog(day)}
                      aria-label={`Dodaj zmiane ${format(day, 'dd.MM.yyyy')}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>

      <ShiftAssignDialog
        employeeId={employeeId}
        isOpen={isDialogOpen}
        selectedDate={selectedDate}
        templates={templates}
        isTemplatesLoading={isLoadingTemplates}
        onOpenChange={setIsDialogOpen}
        onAssigned={handleAssign}
      />

      <Dialog open={isWeekApplyDialogOpen} onOpenChange={setIsWeekApplyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{'Zastosuj zmian\u0119 na ca\u0142y tydzie\u0144'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="week-apply-template">Szablon</Label>
              <Select value={weekApplyTemplateId} onValueChange={setWeekApplyTemplateId}>
                <SelectTrigger id="week-apply-template">
                  <SelectValue placeholder={isLoadingTemplates ? 'Ladowanie...' : 'Wybierz szablon'} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({formatTime(template.start_time)}-{formatTime(template.end_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoadingTemplates && templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak aktywnych szablonow zmian.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Dni</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEEK_APPLY_DAY_OPTIONS.map((day) => (
                  <label key={day.index} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={weekApplyDays[day.index] ?? false}
                      onCheckedChange={(checked) =>
                        setWeekApplyDays((current) => ({
                          ...current,
                          [day.index]: checked === true,
                        }))
                      }
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsWeekApplyDialogOpen(false)}
              disabled={isApplyingWeek}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={() => void handleApplyToWeek()} disabled={isApplyingWeek}>
              {isApplyingWeek ? 'Zapisywanie...' : 'Zastosuj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
