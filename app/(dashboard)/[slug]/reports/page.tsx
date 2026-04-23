'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSalon } from '@/hooks/use-salon'
import { useEmployees } from '@/hooks/use-employees'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Payload } from 'recharts/types/component/DefaultTooltipContent'

// Charts components
import RevenueChart from '@/components/dashboard/revenue-chart'
import ServicesChart from '@/components/dashboard/services-chart'
import EmployeeRevenueChart from '@/components/dashboard/employee-revenue-chart'

interface NpsStats {
  avg_nps: number
  total_responses: number
  promoters: number
  passives: number
  detractors: number
  nps_score: number
}

interface NpsComment {
  rating: number
  nps_score: number
  comment: string | null
  submitted_at: string
}

interface RevenueRow {
  booking_date: string
  booking_count: number
  revenue: number
}

interface TopService {
  service_name: string
  booking_count: number
  total_revenue: number
  avg_rating: number | null
}

interface TopEmployee {
  employee_id: string
  employee_name: string
  bookings_count: number
  revenue: number
  commission_earned: number
}

interface ApiResponse<T> {
  data: T | null
  error: string | null
}

interface PaymentMethodsResponse {
  rows: Array<{
    method: string
    count: number
    total_value: number
  }>
  total_count: number
  total_value: number
}

interface HoursWorkedRow {
  employee_id: string
  employee_name: string
  total_minutes: number
  appointments_count: number
  avg_minutes: number
}

interface EmployeeFilterOption {
  id: string
  name: string
}

type HoursWorkedSortKey = 'employee_name' | 'total_minutes' | 'appointments_count' | 'avg_minutes'
type SortDirection = 'asc' | 'desc'

export default function ReportsPage(): JSX.Element {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.slug as string
  const tabParam = searchParams.get('tab') || 'overview'

  const { data: salonData } = useSalon(slug)
  const { data: employeesData } = useEmployees()
  const salon = salonData?.salon
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState<boolean>(true)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')

  const [npsData, setNpsData] = useState<NpsStats | null>(null)
  const [npsComments, setNpsComments] = useState<NpsComment[]>([])
  const [revenueData, setRevenueData] = useState<RevenueRow[]>([])
  const [topServices, setTopServices] = useState<TopService[]>([])
  const [topEmployees, setTopEmployees] = useState<TopEmployee[]>([])
  const [paymentMethodsData, setPaymentMethodsData] = useState<PaymentMethodsResponse>({
    rows: [],
    total_count: 0,
    total_value: 0
  })
  const [hoursWorkedData, setHoursWorkedData] = useState<HoursWorkedRow[]>([])
  const [hoursWorkedSortBy, setHoursWorkedSortBy] = useState<HoursWorkedSortKey>('total_minutes')
  const [hoursWorkedSortDir, setHoursWorkedSortDir] = useState<SortDirection>('desc')

  const fetchData = useCallback(async (range: number): Promise<void> => {
    setLoading(true)
    const to = new Date()
    const from = new Date()
    from.setDate(to.getDate() - range)

    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]
    const hoursWorkedParams = new URLSearchParams({
      from: fromStr,
      to: toStr,
    })
    if (selectedEmployeeId !== 'all') {
      hoursWorkedParams.set('employeeId', selectedEmployeeId)
    }

    try {
      const [npsRes, revRes, topRes, empRes, paymentMethodsRes, hoursWorkedRes] = await Promise.all([
        fetch(`/api/reports/nps?from=${fromStr}&to=${toStr}`),
        fetch(`/api/reports/revenue?from=${fromStr}&to=${toStr}`),
        fetch(`/api/reports/top-services?from=${fromStr}&to=${toStr}`),
        fetch(`/api/reports/top-employees?from=${fromStr}&to=${toStr}`),
        fetch(`/api/reports/payment-methods?from=${fromStr}&to=${toStr}`),
        fetch(`/api/reports/hours-worked?${hoursWorkedParams.toString()}`)
      ])

      const [nps, rev, top, emp, paymentMethods, hoursWorked] = await Promise.all([
        npsRes.json(),
        revRes.json(),
        topRes.json(),
        empRes.json(),
        paymentMethodsRes.json(),
        hoursWorkedRes.json()
      ])

      setNpsData(nps.stats || null)
      setNpsComments(nps.comments || [])
      setRevenueData(rev.rows || [])
      setTopServices(top.rows || [])
      setTopEmployees(emp.data || [])
      setPaymentMethodsData({
        rows: paymentMethods.rows || [],
        total_count: paymentMethods.total_count || 0,
        total_value: paymentMethods.total_value || 0
      })
      setHoursWorkedData(hoursWorked.rows || [])
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedEmployeeId])

  useEffect(() => {
    fetchData(days)
  }, [days, fetchData])

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams.toString())
    newParams.set('tab', value)
    router.push(`/${slug}/reports?${newParams.toString()}`)
  }

  const formatPLN = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount)
  }

  const formatMinutes = (mins: number): string => {
    const safeMinutes = Number.isFinite(mins) ? Math.max(0, Math.round(mins)) : 0
    const hours = Math.floor(safeMinutes / 60)
    const minutes = safeMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const handleHoursWorkedSort = (key: HoursWorkedSortKey): void => {
    if (hoursWorkedSortBy === key) {
      setHoursWorkedSortDir(hoursWorkedSortDir === 'asc' ? 'desc' : 'asc')
      return
    }
    setHoursWorkedSortBy(key)
    setHoursWorkedSortDir('asc')
  }

  const renderStars = (rating: number): JSX.Element => {
    return (
      <div className="flex text-yellow-400">
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className={s <= rating ? "fill-current" : "text-gray-300"}>★</span>
        ))}
      </div>
    )
  }

  const totalRevenue = revenueData.reduce((acc, row) => acc + row.revenue, 0)
  const totalBookings = revenueData.reduce((acc, row) => acc + row.booking_count, 0)

  // Format data for recharts
  const chartData = revenueData.map(row => ({
    date: new Date(row.booking_date).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }),
    amount: row.revenue
  })).reverse() // Assuming API returns descending, we want ascending for chart

  const servicesChartData = topServices.map(service => ({
    name: service.service_name,
    value: service.booking_count // Alternatively, could be total_revenue
  }))

  const employeesChartData = topEmployees.map(emp => ({
    name: emp.employee_name,
    amount: emp.revenue
  }))

  const paymentMethodLabels: Record<string, string> = {
    cash: 'Gotowka',
    card: 'Karta',
    transfer: 'Przelew',
    other: 'Inne',
    voucher: 'Voucher',
  }

  const paymentMethodsChartData = paymentMethodsData.rows.map((row) => ({
    method: paymentMethodLabels[row.method] ?? paymentMethodLabels.other,
    count: row.count,
    total_value: row.total_value
  }))

  const hoursWorkedEmployeeOptions: EmployeeFilterOption[] = (employeesData || [])
    .map((employee) => {
      const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
      return {
        id: employee.id,
        name: fullName || 'Bez nazwy',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

  const sortedHoursWorkedData = [...hoursWorkedData].sort((a, b) => {
    if (hoursWorkedSortBy === 'employee_name') {
      const comparison = a.employee_name.localeCompare(b.employee_name, 'pl')
      return hoursWorkedSortDir === 'asc' ? comparison : -comparison
    }

    const aValue = a[hoursWorkedSortBy]
    const bValue = b[hoursWorkedSortBy]
    const numericComparison = aValue - bValue
    return hoursWorkedSortDir === 'asc' ? numericComparison : -numericComparison
  })

  const sortIndicator = (key: HoursWorkedSortKey): string => {
    if (hoursWorkedSortBy !== key) {
      return '↕'
    }
    return hoursWorkedSortDir === 'asc' ? '↑' : '↓'
  }

  const toDate = new Date().toISOString().split('T')[0]
  const fromDate = new Date(new Date().setDate(new Date().getDate() - days)).toISOString().split('T')[0]
  const csvLink = `/api/reports/revenue?from=${fromDate}&to=${toDate}&format=csv&salon_id=${salon?.id || ''}`

  if (loading && !npsData) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-10 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="flex gap-2">
          {[7, 30, 90].map(d => <div key={d} className="h-9 w-20 bg-gray-200 animate-pulse rounded" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-48 bg-gray-100 animate-pulse rounded-xl" />
          <div className="h-48 col-span-2 bg-gray-100 animate-pulse rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Raporty i analityka</h1>
          <p className="text-muted-foreground mt-1 text-sm theme-header-subtitle">Zarządzaj wynikami i zadowoleniem klientów w jednym miejscu.</p>
        </div>
        <div className="flex items-center gap-2 p-1 glass rounded-xl">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "ghost"}
              onClick={() => setDays(d)}
              size="sm"
              className={`rounded-lg transition-all ${days === d ? 'shadow-sm' : 'hover:bg-muted/50'}`}
            >
              Ostatnie {d} dni
            </Button>
          ))}
        </div>
      </div>

      <Tabs value={tabParam} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <TabsList className="bg-transparent h-auto p-0 gap-2 flex w-max sm:w-auto">
            <TabsTrigger
              value="overview"
              className="px-6 py-3 rounded-xl font-bold transition-all border border-border/50 bg-card/50 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary/20 data-[state=active]:shadow-lg"
            >
              Przegląd
            </TabsTrigger>
            <TabsTrigger
              value="revenue"
              className="px-6 py-3 rounded-xl font-bold transition-all border border-border/50 bg-card/50 text-muted-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:border-emerald-600/20 data-[state=active]:shadow-lg"
            >
              Przychody
            </TabsTrigger>
            <TabsTrigger
              value="visits"
              className="px-6 py-3 rounded-xl font-bold transition-all border border-border/50 bg-card/50 text-muted-foreground data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:border-blue-600/20 data-[state=active]:shadow-lg"
            >
              Wizyty i Usługi
            </TabsTrigger>
            <TabsTrigger
              value="employees"
              className="px-6 py-3 rounded-xl font-bold transition-all border border-border/50 bg-card/50 text-muted-foreground data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:border-purple-600/20 data-[state=active]:shadow-lg"
            >
              Pracownicy
            </TabsTrigger>
            <TabsTrigger
              value="nps"
              className="px-6 py-3 rounded-xl font-bold transition-all border border-border/50 bg-card/50 text-muted-foreground data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:border-orange-500/20 data-[state=active]:shadow-lg"
            >
              Opinie i NPS
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ======================= OVERVIEW TAB ======================= */}
        <TabsContent value="overview" className="space-y-6 animate-in fade-in-50 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="glass border-none overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Suma Przychodów ({days} dni)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl sm:text-4xl font-bold text-foreground">{formatPLN(totalRevenue)}</div>
              </CardContent>
            </Card>

            <Card className="glass border-none overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Liczba Wizyt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl sm:text-4xl font-bold text-foreground">{totalBookings}</div>
              </CardContent>
            </Card>

            <Card className="glass border-none overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent transition-opacity group-hover:opacity-100 opacity-50" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wskaźnik NPS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl sm:text-4xl font-bold ${npsData && npsData.nps_score > 50 ? 'text-green-600' : npsData && npsData.nps_score > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                    {npsData?.nps_score || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">/{npsData?.total_responses || 0} opinii</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueChart data={chartData} title={`Przychody (ostatnie ${days} dni)`} />
            <ServicesChart data={servicesChartData.slice(0, 5)} />
          </div>
        </TabsContent>

        {/* ======================= REVENUE TAB ======================= */}
        <TabsContent value="revenue" className="space-y-6 animate-in fade-in-50 duration-500">
          <RevenueChart data={chartData} title={`Zarobki (ostatnie ${days} dni)`} />

          <Card className="glass border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Metody platnosci</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-[320px] w-full">
                {paymentMethodsChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Brak danych w wybranym okresie</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentMethodsChartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="method" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        content={(props: any) => {
                          if (!props?.active || !props?.payload?.length) {
                            return null
                          }
                          const row = props.payload[0]?.payload as { method?: string; count?: number; total_value?: number } | undefined
                          const method = row?.method || 'Nie podano'
                          const count = typeof row?.count === 'number' ? row.count : 0
                          const totalValue = typeof row?.total_value === 'number' ? row.total_value : 0
                          return (
                            <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
                              <div className="mb-1 font-medium">{`Metoda: ${method}`}</div>
                              <div>{`Liczba transakcji: ${count}`}</div>
                              <div>{`Suma wartosci: ${formatPLN(totalValue)}`}</div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="count" name="count" fill="#16a34a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-sm">
                <span className="text-muted-foreground">Liczba transakcji: <span className="font-semibold text-foreground">{paymentMethodsData.total_count}</span></span>
                <span className="text-muted-foreground">Suma wartosci: <span className="font-semibold text-foreground">{formatPLN(paymentMethodsData.total_value)}</span></span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
              <CardTitle className="text-lg">Szczegółowe dane</CardTitle>
              <a
                href={csvLink}
                download={`raport_przychody_${fromDate}_${toDate}.csv`}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors"
              >
                Eksportuj CSV
              </a>
            </CardHeader>
            <CardContent className="pt-4 p-0">
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase text-muted-foreground bg-muted/30">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Data</th>
                      <th className="px-6 py-3 text-right font-semibold">Liczba wizyt</th>
                      <th className="px-6 py-3 text-right font-semibold">Przychód</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {revenueData.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">Brak danych w wybranym okresie</td>
                      </tr>
                    ) : (
                      revenueData.map((row) => (
                        <tr key={row.booking_date} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3 font-medium">{new Date(row.booking_date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })}</td>
                          <td className="px-6 py-3 text-right">{row.booking_count}</td>
                          <td className="px-6 py-3 text-right font-bold text-emerald-600">{formatPLN(row.revenue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-muted/50 font-bold border-t-2">
                    <tr>
                      <th className="px-6 py-4">Suma</th>
                      <td className="px-6 py-4 text-right">{totalBookings}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 text-lg">{formatPLN(totalRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= VISITS & SERVICES TAB ======================= */}
        <TabsContent value="visits" className="space-y-6 animate-in fade-in-50 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ServicesChart data={servicesChartData.slice(0, 5)} />

            <Card className="glass border-none">
              <CardHeader>
                <CardTitle className="text-lg">Top Usługi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topServices.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Brak danych</p>
                  ) : (
                    topServices.map((service, index) => (
                      <div key={service.service_name} className="flex items-center gap-4 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-sm shadow-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate text-foreground theme-service-name">{service.service_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{service.booking_count} wizyt</span>
                            {service.avg_rating && (
                              <div className="flex items-center text-xs">
                                {renderStars(Math.round(service.avg_rating))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-blue-600">{formatPLN(service.total_revenue)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ======================= EMPLOYEES TAB ======================= */}
        <TabsContent value="employees" className="space-y-6 animate-in fade-in-50 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EmployeeRevenueChart data={employeesChartData} title={`Przychód wg pracowników (ostatnie ${days} dni)`} />

            <Card className="glass border-none">
              <CardHeader>
                <CardTitle className="text-lg">Top Pracownicy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topEmployees.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Brak danych o pracownikach</p>
                  ) : (
                    topEmployees.map((emp, index) => (
                      <div key={emp.employee_id || index} className="flex items-center gap-4 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-700 font-bold text-sm shadow-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate text-foreground">{emp.employee_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{emp.bookings_count} wizyt</span>
                            <span className="text-xs text-muted-foreground">Prowizja: {formatPLN(emp.commission_earned)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-purple-600">{formatPLN(emp.revenue)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass border-none shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg">Godziny przepracowane</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Pracownik:</span>
                <select
                  value={selectedEmployeeId}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="Filtruj raport godzin wedlug pracownika"
                >
                  <option value="all">Wszyscy pracownicy</option>
                  {hoursWorkedEmployeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" onClick={() => handleHoursWorkedSort('employee_name')} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
                        Pracownik <span className="text-xs">{sortIndicator('employee_name')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" onClick={() => handleHoursWorkedSort('total_minutes')} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
                        Godziny <span className="text-xs">{sortIndicator('total_minutes')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" onClick={() => handleHoursWorkedSort('appointments_count')} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
                        Liczba wizyt <span className="text-xs">{sortIndicator('appointments_count')}</span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button type="button" onClick={() => handleHoursWorkedSort('avg_minutes')} className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors">
                        Sr. czas wizyty <span className="text-xs">{sortIndicator('avg_minutes')}</span>
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHoursWorkedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Brak danych w wybranym okresie</TableCell>
                    </TableRow>
                  ) : (
                    sortedHoursWorkedData.map((row) => (
                      <TableRow key={row.employee_id}>
                        <TableCell className="font-medium">{row.employee_name}</TableCell>
                        <TableCell className="text-right">{formatMinutes(row.total_minutes)}</TableCell>
                        <TableCell className="text-right">{row.appointments_count}</TableCell>
                        <TableCell className="text-right">{formatMinutes(row.avg_minutes)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= NPS TAB ======================= */}
        <TabsContent value="nps" className="space-y-6 animate-in fade-in-50 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="glass border-none">
              <CardHeader>
                <CardTitle className="text-lg">Twój wynik NPS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-6 border-b border-border/50 mb-6">
                  <div className="relative">
                    <svg className="w-40 h-40 transform -rotate-90">
                      <circle cx="80" cy="80" r="70" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-muted/20" />
                      <circle
                        cx="80" cy="80" r="70"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="12"
                        strokeDasharray={439}
                        strokeDashoffset={npsData ? 439 - (439 * (Math.max(0, npsData.nps_score) / 100)) : 439}
                        className={`${npsData && npsData.nps_score > 50 ? 'text-green-500' : npsData && npsData.nps_score > 0 ? 'text-orange-500' : 'text-red-500'} transition-all duration-1000`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-4xl font-bold ${npsData && npsData.nps_score > 50 ? 'text-green-600' : npsData && npsData.nps_score > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                        {npsData?.nps_score || 0}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground mt-4">
                    Na podstawie {npsData?.total_responses || 0} opinii
                  </span>
                </div>
                <div className="flex justify-between gap-4 text-center">
                  <div className="flex-1 bg-green-50/50 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-green-700 font-semibold mb-1">Promotorzy</p>
                    <p className="text-2xl font-bold text-green-700">{npsData?.promoters || 0}</p>
                  </div>
                  <div className="flex-1 bg-gray-50/50 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-gray-700 font-semibold mb-1">Pasywni</p>
                    <p className="text-2xl font-bold text-gray-700">{npsData?.passives || 0}</p>
                  </div>
                  <div className="flex-1 bg-red-50/50 rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wider text-red-700 font-semibold mb-1">Detraktorzy</p>
                    <p className="text-2xl font-bold text-red-700">{npsData?.detractors || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 glass border-none">
              <CardHeader>
                <CardTitle className="text-lg">Komentarze od klientów</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                  {npsComments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12">
                      <div className="text-4xl mb-3">💭</div>
                      <p className="text-muted-foreground font-medium">Brak opinii klientów w tym okresie</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Ankiety są wysyłane automatycznie po zakończeniu wizyty.</p>
                    </div>
                  ) : (
                    npsComments.map((c, i) => (
                      <div key={i} className="p-5 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/30 transition-colors space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white
                              ${c.nps_score >= 9 ? 'bg-green-500' : c.nps_score >= 7 ? 'bg-gray-400' : 'bg-red-500'}
                            `}>
                              {c.nps_score}
                            </div>
                            <div>
                              <div className="flex gap-0.5">{renderStars(c.rating)}</div>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                            {new Date(c.submitted_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <p className={`text-sm ${c.comment ? 'text-foreground font-medium' : 'text-muted-foreground italic'}`}>
                          {c.comment ? `"${c.comment}"` : "Klient nie zostawił komentarza, tylko ocenę."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

