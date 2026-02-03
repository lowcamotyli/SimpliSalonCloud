'use client'

import { useState, useMemo } from 'react'
import { useEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee, useUpdateEmployeeRole, useLinkEmployeeUser } from '@/hooks/use-employees'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  User,
  Mail,
  Phone,
  TrendingUp,
  Percent,
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  Sparkles,
  ShieldCheck,
  Briefcase
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ImageUpload } from '@/components/ui/image-upload'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { formatPrice } from '@/lib/formatters'
import { useCurrentRole } from '@/hooks/use-current-role'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RBAC_ROLES, Role } from '@/lib/rbac/role-maps'

const employeeFormSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 znaki'),
  lastName: z.string().optional(),
  email: z.string().email('Nieprawidłowy email'),
  phone: z.string().regex(/^\d{9}$/, 'Telefon: 9 cyfr').optional().or(z.literal('')),
  baseThreshold: z.number().min(0).default(0),
  baseSalary: z.number().min(0).default(0),
  commissionRate: z.number().min(0).max(100).default(0),
  avatarUrl: z.string().optional(),
})

type EmployeeFormData = z.infer<typeof employeeFormSchema>

export default function EmployeesPage() {
  const [search, setSearch] = useState('')
  const { data: employees, isLoading } = useEmployees()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [roleDialogEmployee, setRoleDialogEmployee] = useState<any | null>(null)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | ''>('')
  const [linkDialogEmployee, setLinkDialogEmployee] = useState<any | null>(null)
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')

  const params = useParams()
  const slug = params.slug as string

  const { data: salon } = useQuery({
    queryKey: ['salon', slug],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('salons')
        .select('id')
        .eq('slug', slug)
        .single()
      if (error) throw error
      return data
    }
  })

  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee(editingEmployee?.id || '')
  const deleteMutation = useDeleteEmployee(editingEmployee?.id || '')
  const roleMutation = useUpdateEmployeeRole(roleDialogEmployee?.id || '')
  const linkMutation = useLinkEmployeeUser(linkDialogEmployee?.id || '')
  const { isOwnerOrManager } = useCurrentRole()

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
      avatarUrl: '',
    },
    mode: 'onChange',
  })

  const filteredEmployees = useMemo(() => {
    if (!employees) return []
    return employees.filter(emp =>
      emp.first_name.toLowerCase().includes(search.toLowerCase()) ||
      (emp.last_name && emp.last_name.toLowerCase().includes(search.toLowerCase())) ||
      (emp.email && emp.email.toLowerCase().includes(search.toLowerCase())) ||
      (emp.phone && emp.phone.includes(search))
    )
  }, [employees, search])

  const stats = useMemo(() => {
    if (!employees) return { total: 0, active: 0, avgCommission: 0 }
    const total = employees.length
    const active = employees.filter(e => e.active).length
    const avgComm = total > 0
      ? employees.reduce((acc, curr) => acc + curr.commission_rate, 0) / total
      : 0
    return { total, active, avgCommission: avgComm * 100 }
  }, [employees])

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
      avatarUrl: '',
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
      avatarUrl: employee.avatar_url || '',
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

  const handleOpenRoleDialog = (employee: any) => {
    if (!isOwnerOrManager()) return
    setRoleDialogEmployee(employee)
    setSelectedRole((employee?.role as Role) || '')
    setIsRoleDialogOpen(true)
  }

  const handleUpdateRole = async () => {
    if (!roleDialogEmployee || !selectedRole) return
    await roleMutation.mutateAsync(selectedRole)
    setIsRoleDialogOpen(false)
  }

  const handleOpenLinkDialog = (employee: any) => {
    if (!isOwnerOrManager()) return
    setLinkDialogEmployee(employee)
    setLinkEmail(employee?.email || '')
    setIsLinkDialogOpen(true)
  }

  const handleLinkAccount = async () => {
    if (!linkDialogEmployee || !linkEmail) return
    await linkMutation.mutateAsync(linkEmail)
    setIsLinkDialogOpen(false)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      {/* Header & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Pracownicy
          </h1>
          <p className="text-gray-500 text-base font-medium">Zarządzaj zespołem swojego salonu</p>
        </div>
        <Button
          size="lg"
          className="gradient-button shadow-lg h-12 px-6 rounded-xl font-bold"
          onClick={handleAdd}
        >
          <Plus className="h-5 w-5 mr-2" />
          Dodaj pracownika
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Zespół</p>
            <p className="text-2xl font-black text-gray-900">{stats.total}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Aktywni</p>
            <p className="text-2xl font-black text-gray-900">{stats.active}</p>
          </div>
        </Card>
        <Card className="p-4 glass border-none shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">Śr. Prowizja</p>
            <p className="text-2xl font-black text-gray-900">{stats.avgCommission.toFixed(0)}%</p>
          </div>
        </Card>
      </div>

      {/* Search Bar */}
      <Card className="p-4 glass border-none shadow-xl shadow-slate-200/50">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Szukaj po imieniu, nazwisku, emailu lub telefonie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 bg-white/50 border-gray-200/50 focus:bg-white transition-all text-base rounded-xl"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="h-12 w-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Ładowanie zespołu...</p>
        </div>
      ) : filteredEmployees.length > 0 ? (
        <motion.div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filteredEmployees.map((employee) => (
              <motion.div key={employee.id} layout variants={itemVariants}>
                <Card className="group relative overflow-hidden p-6 transition-all border-none bg-white hover:shadow-2xl hover:shadow-primary/10">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="relative h-24 w-24 rounded-2xl overflow-hidden bg-gray-50 flex items-center justify-center border-2 border-white shadow-inner">
                      {employee.avatar_url ? (
                        <Image
                          src={employee.avatar_url}
                          alt={employee.first_name}
                          fill
                          className="object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-primary/5 text-primary text-3xl font-black">
                          {employee.first_name[0]}{employee.last_name?.[0] || ''}
                        </div>
                      )}

                      {employee.active ? (
                        <div className="absolute top-1 right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
                      ) : (
                        <div className="absolute top-1 right-1 h-3 w-3 rounded-full bg-slate-300 border-2 border-white" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-gray-900">
                        {employee.first_name} {employee.last_name}
                      </h3>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full">
                          Kod: {employee.employee_code}
                        </p>
                        {employee.role && (
                          <Badge variant="secondary" className="uppercase tracking-wider text-[10px]">
                            {employee.role}
                          </Badge>
                        )}
                        {!employee.user_id && (
                          <Badge variant="outline" className="uppercase tracking-wider text-[10px] text-rose-600 border-rose-200">
                            Brak konta
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="w-full space-y-2 py-4">
                      {employee.email && (
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="truncate">{employee.email}</span>
                        </div>
                      )}
                      {employee.phone && (
                        <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span>{employee.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-full grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl">
                      <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase">Próg</p>
                        <p className="text-xs font-bold text-gray-700">{Math.round(employee.base_threshold)} zł</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase">Podst.</p>
                        <p className="text-xs font-bold text-gray-700">{Math.round(employee.base_salary)} zł</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase">Prow.</p>
                        <p className="text-xs font-bold text-emerald-600">{(employee.commission_rate * 100).toFixed(0)}%</p>
                      </div>
                    </div>

                    <div className="pt-2 w-full flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        className="w-full rounded-xl font-bold bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all shadow-none"
                        onClick={() => handleEdit(employee)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edytuj profil
                      </Button>
                      {isOwnerOrManager() && (
                        <Button
                          variant="outline"
                          className="w-full rounded-xl font-bold"
                          onClick={() => handleOpenRoleDialog(employee)}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Zmień rolę
                        </Button>
                      )}
                      {isOwnerOrManager() && !employee.user_id && (
                        <Button
                          variant="outline"
                          className="w-full rounded-xl font-bold text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={() => handleOpenLinkDialog(employee)}
                        >
                          <User className="mr-2 h-4 w-4" />
                          Powiąż konto
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-24 px-6 text-center glass border-dashed border-2 border-gray-200">
          <div className="h-20 w-20 rounded-full bg-gray-50 flex items-center justify-center mb-6">
            {search ? <Search className="h-10 w-10 text-gray-300" /> : <Sparkles className="h-10 w-10 text-gray-300" />}
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {search ? 'Nie znaleziono pracowników' : 'Brak zespołu'}
          </h3>
          <p className="text-gray-500 max-w-sm mb-8">
            {search
              ? 'Spróbuj zmienić parametry wyszukiwania.'
              : 'W Twoim salonie nie ma jeszcze dodanych pracowników. Dodaj pierwszego członka zespołu!'}
          </p>
          <Button
            variant={search ? "outline" : "default"}
            onClick={search ? () => setSearch('') : handleAdd}
            className={cn("rounded-xl font-bold", !search && "gradient-button")}
          >
            {search ? 'Wyczyść wyszukiwanie' : 'Dodaj pracownika'}
          </Button>
        </Card>
      )}

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text text-2xl font-black">
              {editingEmployee ? 'Edytuj pracownika' : 'Dodaj pracownika'}
            </DialogTitle>
            <DialogDescription>
              Wypełnij dane pracownika oraz konfigurację wynagrodzenia.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pt-4">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex flex-col items-center space-y-4">
                <Label className="font-bold text-gray-700">Zdjęcie profilowe</Label>
                <ImageUpload
                  value={form.watch('avatarUrl')}
                  onChange={(url) => form.setValue('avatarUrl', url, { shouldValidate: true })}
                  onRemove={() => form.setValue('avatarUrl', '', { shouldValidate: true })}
                  salonId={(salon as any)?.id || ''}
                />
              </div>

              <div className="flex-1 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="font-bold text-gray-700">Imię *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="firstName"
                        placeholder="Kasia"
                        {...form.register('firstName')}
                        className="pl-10 glass h-11 rounded-xl focus:bg-white"
                      />
                    </div>
                    {form.formState.errors.firstName && (
                      <p className="text-xs text-rose-600 font-bold">{form.formState.errors.firstName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="font-bold text-gray-700">Nazwisko</Label>
                    <Input
                      id="lastName"
                      placeholder="Nowak"
                      {...form.register('lastName')}
                      className="glass h-11 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-bold text-gray-700">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="kasia@example.com"
                        {...form.register('email')}
                        className="pl-10 glass h-11 rounded-xl focus:bg-white"
                      />
                    </div>
                    {form.formState.errors.email && (
                      <p className="text-xs text-rose-600 font-bold">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="font-bold text-gray-700">Telefon</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="phone"
                        placeholder="123456789"
                        {...form.register('phone')}
                        className="pl-10 glass h-11 rounded-xl focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl space-y-4 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <h4 className="font-black text-gray-900 uppercase tracking-wider text-sm">Warunki wynagrodzenia</h4>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="baseThreshold" className="text-xs font-bold text-gray-500">Próg (zł)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="baseThreshold"
                      type="number"
                      step="0.01"
                      {...form.register('baseThreshold', { valueAsNumber: true })}
                      className="pl-9 glass h-11 rounded-xl bg-white border-transparent"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseSalary" className="text-xs font-bold text-gray-500">Podstawa (zł)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="baseSalary"
                      type="number"
                      step="0.01"
                      {...form.register('baseSalary', { valueAsNumber: true })}
                      className="pl-9 glass h-11 rounded-xl bg-white border-transparent"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commissionRate" className="text-xs font-bold text-gray-500">Prowizja (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="commissionRate"
                      type="number"
                      step="0.1"
                      {...form.register('commissionRate', { valueAsNumber: true })}
                      className="pl-9 glass h-11 rounded-xl bg-white border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex items-center gap-2 mr-auto">
                {editingEmployee && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl font-bold"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Usuń
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-xl font-bold text-gray-500"
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="gradient-button rounded-xl font-black px-8"
                >
                  {editingEmployee ? 'Zapisz zmiany' : 'Dodaj pracownika'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-lg glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text text-2xl font-black">Zmień rolę</DialogTitle>
            <DialogDescription>
              Wybierz nową rolę dla pracownika. Zmiany są ograniczone do Ownera/Managera.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-gray-700">Rola</Label>
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as Role)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Wybierz rolę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RBAC_ROLES.OWNER}>Owner</SelectItem>
                  <SelectItem value={RBAC_ROLES.MANAGER}>Manager</SelectItem>
                  <SelectItem value={RBAC_ROLES.EMPLOYEE}>Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex items-center gap-2 mr-auto">
              {roleDialogEmployee && (
                <p className="text-xs text-gray-500 font-medium">
                  {roleDialogEmployee.first_name} {roleDialogEmployee.last_name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsRoleDialogOpen(false)}
                className="rounded-xl font-bold text-gray-500"
              >
                Anuluj
              </Button>
              <Button
                type="button"
                disabled={roleMutation.isPending || !selectedRole}
                onClick={handleUpdateRole}
                className="gradient-button rounded-xl font-black px-8"
              >
                Zapisz rolę
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Account Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-lg glass rounded-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text text-2xl font-black">Powiąż konto</DialogTitle>
            <DialogDescription>
              Podaj email użytkownika, aby przypisać konto do pracownika.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-gray-700">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="email"
                  value={linkEmail}
                  onChange={(event) => setLinkEmail(event.target.value)}
                  placeholder="user@example.com"
                  className="pl-10 h-11 rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex items-center gap-2 mr-auto">
              {linkDialogEmployee && (
                <p className="text-xs text-gray-500 font-medium">
                  {linkDialogEmployee.first_name} {linkDialogEmployee.last_name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsLinkDialogOpen(false)}
                className="rounded-xl font-bold text-gray-500"
              >
                Anuluj
              </Button>
              <Button
                type="button"
                disabled={linkMutation.isPending || linkEmail.length === 0}
                onClick={handleLinkAccount}
                className="gradient-button rounded-xl font-black px-8"
              >
                Powiąż konto
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
