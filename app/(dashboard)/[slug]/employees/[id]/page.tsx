'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useEmployees } from '@/hooks/use-employees'
import { useCurrentRole } from '@/hooks/use-current-role'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmployeeServicesTab } from '@/components/employees/employee-services-tab'
import { EmployeeShiftsTab } from '@/components/employees/employee-shifts-tab'
import { ShiftTemplatesManager } from '@/components/employees/shift-templates-manager'

type EmployeeProfilePageProps = {
  params: {
    slug: string
    id: string
  }
}

export default function EmployeeProfilePage({ params }: EmployeeProfilePageProps) {
  const { slug, id } = params
  const { data: employees, isLoading, isError } = useEmployees()
  const { isOwnerOrManager } = useCurrentRole()

  const employee = useMemo(() => {
    if (!employees) return undefined
    return employees.find((item) => item.id === id)
  }, [employees, id])

  const fullName = [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || 'Profil pracownika'

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (isError || !employee) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Nie znaleziono pracownika</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ten profil nie istnieje lub nie masz do niego dostepu.
            </p>
            <Link href={`/${slug}/employees`}>
              <Button variant="outline">Powrot do listy pracownikow</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
        <Link href={`/${slug}/employees`}>
          <Button variant="outline">Powrot</Button>
        </Link>
      </div>

      <Tabs defaultValue="informacje" className="w-full">
        <TabsList>
          <TabsTrigger value="informacje">Informacje</TabsTrigger>
          <TabsTrigger value="grafik">Grafik</TabsTrigger>
          <TabsTrigger value="uslugi">Uslugi</TabsTrigger>
        </TabsList>

        <TabsContent value="informacje" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Dane podstawowe</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <p><span className="font-medium">Imie:</span> {employee.first_name}</p>
              <p><span className="font-medium">Nazwisko:</span> {employee.last_name || '-'}</p>
              <p><span className="font-medium">Email:</span> {employee.email || '-'}</p>
              <p><span className="font-medium">Telefon:</span> {employee.phone || '-'}</p>
              <p>
                <span className="font-medium">Rola:</span>{' '}
                {isOwnerOrManager() ? employee.role || '-' : 'Brak dostepu'}
              </p>
              <p className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <Badge variant={employee.active ? 'default' : 'secondary'}>
                  {employee.active ? 'Aktywny' : 'Nieaktywny'}
                </Badge>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grafik" className="mt-4">
          <EmployeeShiftsTab employeeId={id} />
          <div className="mt-6">
            <ShiftTemplatesManager />
          </div>
        </TabsContent>

        <TabsContent value="uslugi" className="mt-4">
          <EmployeeServicesTab employeeId={id} salonSlug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
