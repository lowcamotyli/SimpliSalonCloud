'use client'

import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    BarChart3,
    TrendingUp,
    Users,
    Calendar,
    DollarSign,
    ChevronRight,
    Download,
    Filter
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dynamic from 'next/dynamic'

const RevenueChart = dynamic(() => import('@/components/dashboard/revenue-chart'), { ssr: false })
const EmployeeRevenueChart = dynamic(() => import('@/components/dashboard/employee-revenue-chart'), { ssr: false })
const ServicesChart = dynamic(() => import('@/components/dashboard/services-chart'), { ssr: false })
const OccupancyHeatMap = dynamic(() => import('@/components/dashboard/occupancy-heat-map'), { ssr: false })

import { useBookings } from '@/hooks/use-bookings'
import { useEmployees } from '@/hooks/use-employees'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { pl } from 'date-fns/locale'

export default function ReportsPage({ params }: { params: { slug: string } }) {
    const searchParams = useSearchParams()
    const initialTab = searchParams.get('tab') || 'revenue'
    const [activeTab, setActiveTab] = useState(initialTab)

    // Last 30 days range
    const today = new Date()
    const thirtyDaysAgo = subDays(today, 29)
    const filters = {
        startDate: format(thirtyDaysAgo, 'yyyy-MM-dd'),
        endDate: format(today, 'yyyy-MM-dd')
    }

    const { data: bookings, isLoading: bookingsLoading } = useBookings(filters)
    const { data: employees, isLoading: employeesLoading } = useEmployees()
    const { data: allBookings, isLoading: allBookingsLoading } = useBookings({ limit: 1000 })

    const isLoading = bookingsLoading || employeesLoading || allBookingsLoading

    // 1. Revenue Analytics
    const chartData = useMemo(() => {
        if (!bookings) return []
        const days = eachDayOfInterval({ start: thirtyDaysAgo, end: today })
        return days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const amount = bookings
                .filter(b => b.booking_date === dateStr && b.status === 'completed')
                .reduce((sum, b) => sum + (b.total_price || 0), 0)
            return {
                date: format(day, 'dd.MM'),
                amount
            }
        })
    }, [bookings, thirtyDaysAgo, today])

    const totalRevenue = bookings
        ?.filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + (b.total_price || 0), 0) || 0

    const completedBookings = bookings?.filter(b => b.status === 'completed') || []
    const avgVisitValue = completedBookings.length > 0
        ? totalRevenue / completedBookings.length
        : 0

    const servicesData = useMemo(() => {
        if (!bookings) return []
        const counts: Record<string, number> = {}
        bookings.forEach(b => {
            const name = b.service?.name || 'Inne'
            counts[name] = (counts[name] || 0) + 1
        })
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
    }, [bookings])

    // 2. Employee Analytics
    const employeeRevenueData = useMemo(() => {
        if (!bookings || !employees) return []
        const revenue: Record<string, number> = {}
        bookings
            .filter(b => b.status === 'completed')
            .forEach(b => {
                const id = b.employee?.id
                if (id) revenue[id] = (revenue[id] || 0) + (b.total_price || 0)
            })

        return employees
            .map(emp => ({
                name: `${emp.first_name} ${emp.last_name?.charAt(0)}.`,
                amount: revenue[emp.id] || 0
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
    }, [bookings, employees])

    // 3. Occupancy Heat Map
    const heatMapData = useMemo(() => {
        if (!bookings) return []
        const counts: Record<string, Record<number, number>> = {}
        const dayMap: Record<number, string> = {
            1: 'Pon', 2: 'Wt', 3: 'Śr', 4: 'Czw', 5: 'Pt', 6: 'Sob', 0: 'Ndz'
        }

        bookings.forEach(b => {
            const date = new Date(b.booking_date)
            const day = dayMap[date.getDay()]
            const hour = parseInt(b.booking_time.split(':')[0])

            if (day && hour >= 8 && hour <= 20) {
                if (!counts[day]) counts[day] = {}
                counts[day][hour] = (counts[day][hour] || 0) + 1
            }
        })

        const result: { day: string, hour: number, value: number }[] = []
        Object.keys(counts).forEach(day => {
            Object.keys(counts[day]).forEach(hour => {
                result.push({
                    day,
                    hour: parseInt(hour),
                    value: counts[day][parseInt(hour)]
                })
            })
        })
        return result
    }, [bookings])

    // 4. Client Analytics
    const clientAnalytics = useMemo(() => {
        if (!allBookings) return { new: 0, returning: 0, trend: [] }

        const clientVisits: Record<string, string[]> = {}
        allBookings.forEach(b => {
            const cid = b.client?.id
            if (cid) {
                if (!clientVisits[cid]) clientVisits[cid] = []
                clientVisits[cid].push(b.booking_date)
            }
        })

        let newClientsCount = 0
        let returningClientsCount = 0
        const newClientsByDay: Record<string, number> = {}

        // Initialize trend data for last 30 days
        eachDayOfInterval({ start: thirtyDaysAgo, end: today }).forEach(day => {
            newClientsByDay[format(day, 'yyyy-MM-dd')] = 0
        })

        Object.entries(clientVisits).forEach(([cid, dates]) => {
            const sortedDates = dates.sort()
            const firstVisit = sortedDates[0]
            const firstVisitDate = new Date(firstVisit)

            if (firstVisitDate >= thirtyDaysAgo && firstVisitDate <= today) {
                newClientsCount++
                newClientsByDay[firstVisit] = (newClientsByDay[firstVisit] || 0) + 1
            } else if (sortedDates.some(d => {
                const dt = new Date(d)
                return dt >= thirtyDaysAgo && dt <= today
            })) {
                returningClientsCount++
            }
        })

        const trend = eachDayOfInterval({ start: thirtyDaysAgo, end: today }).map(day => {
            const d = format(day, 'yyyy-MM-dd')
            return {
                date: format(day, 'dd.MM'),
                amount: newClientsByDay[d] || 0 // Use 'amount' to be compatible with RevenueChart
            }
        })

        return {
            new: newClientsCount,
            returning: returningClientsCount,
            trend
        }
    }, [allBookings, thirtyDaysAgo, today])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 font-medium">Przygotowujemy Twoje raporty...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                        Raporty i Analizy
                    </h1>
                    <p className="text-gray-500 text-base font-medium">Ostatnie 30 dni: {format(thirtyDaysAgo, 'd MMM', { locale: pl })} - {format(today, 'd MMM yyyy', { locale: pl })}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="glass rounded-xl h-12 px-6 font-bold flex gap-2">
                        <Filter className="h-5 w-5" />
                        Filtruj
                    </Button>
                    <Button className="gradient-button rounded-xl h-12 px-6 font-bold flex gap-2">
                        <Download className="h-5 w-5" />
                        Eksportuj PDF
                    </Button>
                </div>
            </div>

            <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                <TabsList className="glass p-1 rounded-2xl h-14 w-full sm:w-auto overflow-x-auto overflow-y-hidden">
                    <TabsTrigger value="revenue" className="rounded-xl px-8 h-12 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                        Przychody
                    </TabsTrigger>
                    <TabsTrigger value="visits" className="rounded-xl px-8 h-12 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                        Wizyty
                    </TabsTrigger>
                    <TabsTrigger value="employees" className="rounded-xl px-8 h-12 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                        Pracownicy
                    </TabsTrigger>
                    <TabsTrigger value="clients" className="rounded-xl px-8 h-12 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                        Klienci
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="revenue" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Card className="glass border-none lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-primary" />
                                    Trendy przychodowe (30 dni)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <RevenueChart data={chartData} />
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="glass border-none">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold">Podsumowanie okresu</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center p-4 rounded-xl bg-primary/10 text-primary">
                                        <span className="font-medium">Całkowity przychód</span>
                                        <span className="text-xl font-bold">{totalRevenue.toFixed(2)} zł</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4 rounded-xl bg-secondary text-secondary-foreground">
                                        <span className="font-medium">Średnia wartość wizyty</span>
                                        <span className="text-xl font-bold">{avgVisitValue.toFixed(2)} zł</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="glass border-none">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold">Struktura usług</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[250px]">
                                    <ServicesChart data={servicesData} />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="visits" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="glass border-none">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-primary" />
                                Analiza natężenia wizyt
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                                <div className="p-4 rounded-xl glass border-none">
                                    <p className="text-sm text-gray-500 font-medium">Wszystkie wizyty</p>
                                    <p className="text-2xl font-bold">{bookings?.length || 0}</p>
                                </div>
                                <div className="p-4 rounded-xl glass border-none">
                                    <p className="text-sm text-gray-500 font-medium">Potwierdzone</p>
                                    <p className="text-2xl font-bold text-primary">{bookings?.filter(b => b.status === 'confirmed').length || 0}</p>
                                </div>
                                <div className="p-4 rounded-xl glass border-none">
                                    <p className="text-sm text-gray-500 font-medium">Zrealizowane</p>
                                    <p className="text-2xl font-bold text-violet-700">{completedBookings.length}</p>
                                </div>
                                <div className="p-4 rounded-xl glass border-none">
                                    <p className="text-sm text-gray-500 font-medium">Anulowane</p>
                                    <p className="text-2xl font-bold text-destructive">{bookings?.filter(b => b.status === 'cancelled').length || 0}</p>
                                </div>
                            </div>
                            <div className="bg-gray-50/50 rounded-2xl p-4 sm:p-8">
                                <OccupancyHeatMap data={heatMapData} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="employees" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="glass border-none">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Users className="h-5 w-5 text-primary" />
                                Wydajność zespołu
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <EmployeeRevenueChart data={employeeRevenueData} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="clients" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Card className="glass border-none lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-accent" />
                                    Trend pozyskiwania nowych klientów
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <RevenueChart data={clientAnalytics.trend} /> {/* Reuse RevenueChart format for simplicity */}
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="glass border-none">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold">Struktura bazy klientów</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center p-4 rounded-xl bg-accent/10 text-accent">
                                        <span className="font-medium">Nowi klienci</span>
                                        <span className="text-xl font-bold">{clientAnalytics.new}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4 rounded-xl bg-primary/10 text-primary">
                                        <span className="font-medium">Powracający</span>
                                        <span className="text-xl font-bold">{clientAnalytics.returning}</span>
                                    </div>
                                    <div className="p-4 rounded-xl bg-secondary text-secondary-foreground">
                                        <p className="text-sm font-medium mb-1">Wskaźnik retencji</p>
                                        <p className="text-2xl font-bold">
                                            {clientAnalytics.new + clientAnalytics.returning > 0
                                                ? ((clientAnalytics.returning / (clientAnalytics.new + clientAnalytics.returning)) * 100).toFixed(1)
                                                : 0}%
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="glass border-none">
                                <CardHeader>
                                    <CardTitle className="text-lg font-bold">Ostatni miesiąc</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ServicesChart data={[
                                        { name: 'Nowi', value: clientAnalytics.new },
                                        { name: 'Powracający', value: clientAnalytics.returning }
                                    ]} />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
