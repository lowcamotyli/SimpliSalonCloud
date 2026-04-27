'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type PrefilledSlot = { date: string; time: string; employeeId?: string }

type TimeReservationDialogProps = {
  isOpen: boolean
  onClose: () => void
  prefilledSlot?: PrefilledSlot | null
}

type Employee = { id: string; first_name: string; last_name: string | null }

function defaultDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusHour(time: string): string {
  const [hoursRaw, minutesRaw] = time.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '11:00'
  const total = (hours * 60 + minutes + 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function TimeReservationDialog({ isOpen, onClose, prefilledSlot }: TimeReservationDialogProps): JSX.Element {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(defaultDate())
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const initialDate = prefilledSlot?.date ?? defaultDate()
    const initialStart = prefilledSlot?.time ?? '10:00'
    setDate(initialDate)
    setStartTime(initialStart)
    setEndTime(plusHour(initialStart))
    setEmployeeId(prefilledSlot?.employeeId ?? '')
    setTitle('')
    setError('')
  }, [isOpen, prefilledSlot])

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()

    const loadEmployees = async (): Promise<void> => {
      setLoadingEmployees(true)
      try {
        const response = await fetch('/api/employees', { signal: controller.signal })
        if (!response.ok) throw new Error('Nie udalo sie pobrac pracownikow')
        const payload = (await response.json()) as { employees?: Employee[] }
        setEmployees(Array.isArray(payload.employees) ? payload.employees : [])
      } catch (fetchError) {
        if ((fetchError as Error).name !== 'AbortError') {
          setEmployees([])
          toast.error('Nie udalo sie pobrac pracownikow')
        }
      } finally {
        setLoadingEmployees(false)
      }
    }

    void loadEmployees()
    return () => controller.abort()
  }, [isOpen])

  useEffect(() => {
    if (!employeeId && employees.length > 0) {
      const firstEmployee = employees[0]
      if (firstEmployee) setEmployeeId(prefilledSlot?.employeeId ?? firstEmployee.id)
    }
  }, [employeeId, employees, prefilledSlot?.employeeId])

  const hasTimeError = useMemo(() => {
    if (!date || !startTime || !endTime) return false
    return endTime <= startTime
  }, [date, endTime, startTime])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    if (!employeeId) return setError('Wybierz pracownika')
    if (hasTimeError) return setError('Godzina zakonczenia musi byc pozniej niz rozpoczecia')

    setSubmitting(true)
    try {
      const response = await fetch('/api/time-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          date,
          start_time: startTime,
          end_time: endTime,
          title: title.trim() || null,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Nie udalo sie zapisac rezerwacji')
      toast.success('Rezerwacja dodana')
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nie udalo sie zapisac rezerwacji')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Dodaj rezerwacje czasu</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="time-reservation-employee">Pracownik</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={loadingEmployees || submitting}>
              <SelectTrigger id="time-reservation-employee"><SelectValue placeholder={loadingEmployees ? 'Ladowanie...' : 'Wybierz pracownika'} /></SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>{`${employee.first_name} ${employee.last_name ?? ''}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="time-reservation-date">Data</Label>
            <Input id="time-reservation-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={submitting} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="time-reservation-start">Godzina od</Label>
              <Input id="time-reservation-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} disabled={submitting} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-reservation-end">Godzina do</Label>
              <Input id="time-reservation-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} disabled={submitting} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="time-reservation-title">Tytul</Label>
            <Input id="time-reservation-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="np. Szkolenie, Przerwa" disabled={submitting} />
          </div>
          {(error || hasTimeError) && <p className="text-sm text-destructive">{error || 'Godzina zakonczenia musi byc pozniej niz rozpoczecia'}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Anuluj</Button>
            <Button type="submit" disabled={submitting || loadingEmployees || hasTimeError}>Dodaj</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
