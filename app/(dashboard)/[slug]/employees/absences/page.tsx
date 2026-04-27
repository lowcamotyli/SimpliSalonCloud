'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useCurrentRole } from '@/hooks/use-current-role'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Employee = { id: string; user_id: string | null; first_name: string; last_name: string | null }
type Absence = { id: string; employee_id: string; start_date: string; end_date: string; reason: string | null }
type FormState = { employee_id: string; start_date: string; end_date: string; reason: string }

const emptyForm: FormState = { employee_id: '', start_date: '', end_date: '', reason: '' }

export default function EmployeeAbsencesPage() {
  const { isOwnerOrManager, isEmployee, userContext, isLoading: roleLoading } = useCurrentRole()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState<Absence | null>(null)
  const [deleting, setDeleting] = useState<Absence | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingPending, setDeletingPending] = useState(false)

  const currentEmployee = useMemo(
    () => employees.find((employee) => employee.user_id === userContext?.id) ?? null,
    [employees, userContext?.id]
  )

  const employeeName = (employeeId: string) => {
    const employee = employees.find((item) => item.id === employeeId)
    return employee ? `${employee.first_name} ${employee.last_name ?? ''}`.trim() : 'Nieznany pracownik'
  }

  const fetchEmployees = async () => {
    const response = await fetch('/api/employees')
    if (!response.ok) throw new Error('Nie udało się pobrać pracowników')
    const data = await response.json()
    setEmployees(data.employees as Employee[])
  }

  const fetchAbsences = async (filterValue: string) => {
    const params = new URLSearchParams()
    if (isOwnerOrManager() && filterValue !== 'all') params.set('employeeId', filterValue)
    const response = await fetch(`/api/absences${params.size ? `?${params.toString()}` : ''}`)
    if (!response.ok) throw new Error('Nie udało się pobrać nieobecności')
    const data = await response.json()
    setAbsences(data.absences as Absence[])
  }

  useEffect(() => {
    if (roleLoading) return
    const load = async () => {
      setLoading(true)
      try {
        await Promise.all([fetchEmployees(), fetchAbsences(employeeFilter)])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [roleLoading, employeeFilter])

  useEffect(() => {
    if (!isEmployee() || !currentEmployee) return
    setForm((value) => ({ ...value, employee_id: value.employee_id || currentEmployee.id }))
  }, [currentEmployee, isEmployee])

  const openCreateDialog = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      employee_id: isEmployee() ? currentEmployee?.id ?? '' : currentEmployee?.id ?? '',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (absence: Absence) => {
    setEditing(absence)
    setForm({
      employee_id: absence.employee_id,
      start_date: absence.start_date,
      end_date: absence.end_date,
      reason: absence.reason ?? '',
    })
    setDialogOpen(true)
  }

  const refreshAbsences = async () => {
    await fetchAbsences(employeeFilter)
  }

  const handleSubmit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) {
      toast.error('Uzupełnij wymagane pola')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(editing ? `/api/absences/${editing.id}` : '/api/absences', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason.trim() || null,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error((data as { error?: string } | null)?.error ?? 'Nie udało się zapisać nieobecności')
      }
      await refreshAbsences()
      setDialogOpen(false)
      toast.success(editing ? 'Nieobecność zaktualizowana' : 'Nieobecność dodana')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeletingPending(true)
    try {
      const response = await fetch(`/api/absences/${deleting.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error((data as { error?: string } | null)?.error ?? 'Nie udało się usunąć nieobecności')
      }
      await refreshAbsences()
      setDeleting(null)
      toast.success('Nieobecność usunięta')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wystąpił błąd')
    } finally {
      setDeletingPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nieobecności</h1>
          <p className="text-sm text-muted-foreground">Zarządzanie urlopami i innymi nieobecnościami pracowników.</p>
        </div>
        <Button onClick={openCreateDialog} disabled={isEmployee() && !currentEmployee}>Dodaj nieobecność</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {isOwnerOrManager() ? (
          <div className="w-full max-w-xs space-y-2">
            <Label htmlFor="employee-filter">Pracownik</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger id="employee-filter"><SelectValue placeholder="Wszyscy pracownicy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszyscy pracownicy</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>{employeeName(employee.id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : <Badge variant="secondary">{currentEmployee ? employeeName(currentEmployee.id) : 'Twoje nieobecności'}</Badge>}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pracownik</TableHead>
              <TableHead>Od</TableHead>
              <TableHead>Do</TableHead>
              <TableHead>Powód</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Ładowanie...</TableCell></TableRow>
            ) : absences.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Brak nieobecności.</TableCell></TableRow>
            ) : (
              absences.map((absence) => (
                <TableRow key={absence.id}>
                  <TableCell>{employeeName(absence.employee_id)}</TableCell>
                  <TableCell>{format(new Date(absence.start_date), 'dd.MM.yyyy')}</TableCell>
                  <TableCell>{format(new Date(absence.end_date), 'dd.MM.yyyy')}</TableCell>
                  <TableCell>{absence.reason?.trim() || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(absence)}>Edytuj</Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleting(absence)}>Usuń</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edytuj nieobecność' : 'Dodaj nieobecność'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {isOwnerOrManager() ? (
              <div className="space-y-2">
                <Label htmlFor="employee">Pracownik</Label>
                <Select value={form.employee_id} onValueChange={(value) => setForm((current) => ({ ...current, employee_id: value }))}>
                  <SelectTrigger id="employee"><SelectValue placeholder="Wybierz pracownika" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>{employeeName(employee.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2"><Label>Pracownik</Label><Input value={currentEmployee ? employeeName(currentEmployee.id) : ''} disabled /></div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="start_date">Od</Label><Input id="start_date" type="date" value={form.start_date} onChange={(e) => setForm((current) => ({ ...current, start_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="end_date">Do</Label><Input id="end_date" type="date" value={form.end_date} onChange={(e) => setForm((current) => ({ ...current, end_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="reason">Powód</Label><Input id="reason" value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Np. urlop, L4" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Zapisywanie...' : 'Zapisz'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć nieobecność?</AlertDialogTitle>
            <AlertDialogDescription>Ta operacja jest nieodwracalna.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deletingPending}>{deletingPending ? 'Usuwanie...' : 'Usuń'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
