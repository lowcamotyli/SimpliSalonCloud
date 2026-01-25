'use client'

import { useState } from 'react'
import { useEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee } from '@/hooks/use-employees'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const employeeFormSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 znaki'),
  lastName: z.string().optional(),
  email: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  phone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr').optional().or(z.literal('')),
  baseThreshold: z.number().min(0).default(0),
  baseSalary: z.number().min(0).default(0),
  commissionRate: z.number().min(0).max(100).default(0),
})

type EmployeeFormData = z.infer<typeof employeeFormSchema>

export default function EmployeesPage() {
  const { data: employees, isLoading } = useEmployees()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee(editingEmployee?.id || '')
  const deleteMutation = useDeleteEmployee(editingEmployee?.id || '')

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      baseThreshold: 0,
      baseSalary: 0,
      commissionRate: 0,
    },
  })

  const handleAdd = () => {
    setEditingEmployee(null)
    form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      baseThreshold: 0,
      baseSalary: 0,
      commissionRate: 0,
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee)
    form.reset({
      firstName: employee.first_name,
      lastName: employee.last_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      baseThreshold: employee.base_threshold,
      baseSalary: employee.base_salary,
      commissionRate: employee.commission_rate * 100, // Convert to percentage
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (data: EmployeeFormData) => {
    const payload = {
      ...data,
      commissionRate: data.commissionRate / 100, // Convert back to decimal
    }

    if (editingEmployee) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }

    setIsDialogOpen(false)
    form.reset()
  }

  const handleDelete = async () => {
    if (!editingEmployee) return
    
    if (confirm(`Czy na pewno chcesz usunąć pracownika ${editingEmployee.first_name}?`)) {
      await deleteMutation.mutateAsync()
      setIsDialogOpen(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Ładowanie...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pracownicy</h1>
          <p className="mt-2 text-gray-600">Zarządzaj pracownikami salonu</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj pracownika
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {employees?.map((employee) => (
          <Card key={employee.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span>
                    {employee.first_name} {employee.last_name}
                  </span>
                </div>
                <Badge variant="secondary">{employee.employee_code}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm">
                {employee.email && (
                  <p className="text-gray-600">📧 {employee.email}</p>
                )}
                {employee.phone && (
                  <p className="text-gray-600">📱 {employee.phone}</p>
                )}
              </div>

              <div className="border-t pt-3 space-y-1 text-sm">
                <p className="text-gray-600">
                  Próg: <span className="font-medium">{employee.base_threshold.toFixed(2)} zł</span>
                </p>
                <p className="text-gray-600">
                  Podstawa: <span className="font-medium">{employee.base_salary.toFixed(2)} zł</span>
                </p>
                <p className="text-gray-600">
                  Prowizja: <span className="font-medium">{(employee.commission_rate * 100).toFixed(1)}%</span>
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(employee)}
                  className="flex-1"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edytuj
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {employees?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Brak pracowników</h3>
            <p className="mt-2 text-gray-600">Dodaj pierwszego pracownika, aby rozpocząć</p>
            <Button onClick={handleAdd} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Dodaj pracownika
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? 'Edytuj pracownika' : 'Dodaj pracownika'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Imię *</Label>
                <Input
                  id="firstName"
                  {...form.register('firstName')}
                  placeholder="Kasia"
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.firstName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Nazwisko</Label>
                <Input
                  id="lastName"
                  {...form.register('lastName')}
                  placeholder="Nowak"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register('email')}
                  placeholder="kasia@example.com"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  {...form.register('phone')}
                  placeholder="123456789"
                />
                {form.formState.errors.phone && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-4">Konfiguracja wynagrodzenia</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="baseThreshold">Próg (zł)</Label>
                  <Input
                    id="baseThreshold"
                    type="number"
                    step="0.01"
                    {...form.register('baseThreshold', { valueAsNumber: true })}
                    placeholder="5000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseSalary">Podstawa (zł)</Label>
                  <Input
                    id="baseSalary"
                    type="number"
                    step="0.01"
                    {...form.register('baseSalary', { valueAsNumber: true })}
                    placeholder="3000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commissionRate">Prowizja (%)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    step="0.1"
                    {...form.register('commissionRate', { valueAsNumber: true })}
                    placeholder="50"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              {editingEmployee && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Usuń
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Anuluj
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingEmployee ? 'Zapisz' : 'Dodaj'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}