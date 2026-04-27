'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Employee = { id: string; first_name: string; last_name: string | null }

type AbsenceDialogProps = {
  isOpen: boolean
  onClose: () => void
  prefilledRange?: { startDate: string; endDate: string } | null
}

export function AbsenceDialog({ isOpen, onClose, prefilledRange }: AbsenceDialogProps): JSX.Element {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [startDate, setStartDate] = useState(prefilledRange?.startDate ?? '')
  const [endDate, setEndDate] = useState(prefilledRange?.endDate ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStartDate(prefilledRange?.startDate ?? '')
    setEndDate(prefilledRange?.endDate ?? '')
    setReason('')
    setError('')
  }, [isOpen, prefilledRange?.endDate, prefilledRange?.startDate])

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()

    const loadEmployees = async (): Promise<void> => {
      setLoadingEmployees(true)
      try {
        const response = await fetch('/api/employees', { signal: controller.signal })
        if (!response.ok) throw new Error('Nie udalo sie pobrac pracownikow')
        const payload = (await response.json()) as { employees?: Employee[] }
        const nextEmployees = Array.isArray(payload.employees) ? payload.employees : []
        setEmployees(nextEmployees)
        setEmployeeId((current) => current || nextEmployees[0]?.id || '')
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

  const hasDateError = Boolean(startDate && endDate && startDate > endDate)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    if (!employeeId) return setError('Wybierz pracownika')
    if (!startDate || !endDate) return setError('Wybierz zakres dat')
    if (hasDateError) return setError('Data koncowa musi byc rowna lub pozniejsza niz data poczatkowa')

    setSubmitting(true)
    try {
      const response = await fetch('/api/absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || null,
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Nie udalo sie zapisac nieobecnosci')
      toast.success('Nieobecnosc dodana')
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nie udalo sie zapisac nieobecnosci')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Dodaj nieobecnosc</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="absence-employee">Pracownik</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={loadingEmployees || submitting}>
              <SelectTrigger id="absence-employee"><SelectValue placeholder={loadingEmployees ? 'Ladowanie...' : 'Wybierz pracownika'} /></SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>{`${employee.first_name} ${employee.last_name ?? ''}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="absence-start">Data od</Label>
              <Input id="absence-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={submitting} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="absence-end">Data do</Label>
              <Input id="absence-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={submitting} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="absence-reason">Powod</Label>
            <Input id="absence-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="np. Urlop, L4" disabled={submitting} />
          </div>
          {(error || hasDateError) && <p className="text-sm text-destructive">{error || 'Data koncowa musi byc rowna lub pozniejsza niz data poczatkowa'}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Anuluj</Button>
            <Button type="submit" disabled={submitting || loadingEmployees || hasDateError}>Dodaj</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
