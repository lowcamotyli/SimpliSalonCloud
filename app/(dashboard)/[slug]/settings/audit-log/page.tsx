'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCurrentRole } from '@/hooks/use-current-role'
import { RBAC_ROLES } from '@/lib/rbac/role-maps'

type HealthDataAccessLog = {
  id: string
  accessed_by: string
  accessed_by_role: string
  resource_type: 'form_response' | 'treatment_record' | 'treatment_photo'
  client_id: string | null
  data_category: 'health' | 'sensitive_health'
  action: 'decrypt' | 'view' | 'export'
  accessed_at: string
  ip_address: string | null
  user_agent: string | null
}

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams()
  const { currentRole, isLoading: isRoleLoading } = useCurrentRole()
  const slug = params.slug as string

  const [logs, setLogs] = useState<HealthDataAccessLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const offset = Number(searchParams.get('offset')) || 0
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const category = searchParams.get('category') || 'all'

  const [filterFrom, setFilterFrom] = useState(from)
  const [filterTo, setFilterTo] = useState(to)
  const [filterCategory, setFilterCategory] = useState(category)

  useEffect(() => {
    if (!isRoleLoading && currentRole !== RBAC_ROLES.OWNER) {
      router.replace(`/${slug}/settings`)
    }
  }, [currentRole, isRoleLoading, router, slug])

  useEffect(() => {
    if (isRoleLoading || currentRole !== RBAC_ROLES.OWNER) {
      return
    }

    const fetchLogs = async () => {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (category && category !== 'all') params.set('data_category', category)

      try {
        const res = await fetch(`/api/audit/health-access?${params.toString()}`)
        if (!res.ok) {
          throw new Error('Wystąpił błąd podczas pobierania logów.')
        }
        const data = await res.json()
        setLogs(data.logs || [])
        setTotal(data.total || 0)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setIsLoading(false)
      }
    }
    fetchLogs()
  }, [searchParams, from, to, category, offset, currentRole, isRoleLoading])

  if (isRoleLoading || currentRole !== RBAC_ROLES.OWNER) {
    return null
  }

  const handleFilterChange = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', '0')
    
    if (filterFrom) params.set('from', filterFrom); else params.delete('from');
    if (filterTo) params.set('to', filterTo); else params.delete('to');
    if (filterCategory !== 'all') params.set('category', filterCategory); else params.delete('category');
    
    router.push(`${pathname}?${params.toString()}`)
  }

  const handlePageChange = (newOffset: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', String(newOffset))
    router.push(`${pathname}?${params.toString()}`)
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getCategoryBadgeVariant = (dataCategory: 'health' | 'sensitive_health'): 'outline' | 'destructive' => {
    return dataCategory === 'sensitive_health' ? 'destructive' : 'outline'
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Logi są przechowywane przez 5 lat i nie mogą być usunięte zgodnie z wymogami RODO Art. 5(1)(f).
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="from">Od</Label>
              <Input id="from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Do</Label>
              <Input id="to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategoria</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Wybierz kategorię..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="health">Zdrowotne</SelectItem>
                  <SelectItem value="sensitive_health">Wrażliwe zdrowotne</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleFilterChange} className="w-full md:w-auto">Filtruj</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Logi dostępu do danych zdrowotnych</CardTitle>
          <CardDescription>Przeglądaj, kto i kiedy uzyskał dostęp do danych zdrowotnych.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data dostępu</TableHead>
                  <TableHead>Rola</TableHead>
                  <TableHead>Typ zasobu</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Akcja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-red-500">{error}</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Brak logów dostępu do danych zdrowotnych.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.accessed_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'medium' })}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{log.accessed_by_role}</Badge></TableCell>
                      <TableCell>{log.resource_type}</TableCell>
                      <TableCell>
                        <Badge variant={getCategoryBadgeVariant(log.data_category)}>
                          {log.data_category}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge>{log.action}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">
              Strona {totalPages > 0 ? currentPage : 0} z {totalPages > 0 ? totalPages : 0}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(offset - PAGE_SIZE)}
                disabled={offset === 0 || isLoading}
              >
                Poprzednia
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePageChange(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || isLoading}
              >
                Następna
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
