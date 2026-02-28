import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Calendar, Users, DollarSign, TrendingUp, Plus, Clock, ArrowUpRight, Activity } from 'lucide-react'
import Link from 'next/link'
import { StatCard } from '@/components/dashboard/stat-card'
import RevenueChart from '@/components/dashboard/revenue-chart'
import ServicesChart from '@/components/dashboard/services-chart'
import EmployeeRevenueChart from '@/components/dashboard/employee-revenue-chart'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

import { EmptyState } from '@/components/ui/empty-state'

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  // Get salon ID from slug
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (!salon) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] glass p-12 rounded-3xl">
        <Activity className="h-16 w-16 text-rose-500 mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-gray-900">Salon nie znaleziony</h2>
        <p className="text-gray-500 mt-2">Upewnij się, że używasz poprawnego linku.</p>
      </div>
    )
  }

  const typedSalon = salon as any
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd')
  const sevenDaysAgo = subDays(today, 6)
  const sevenDaysAgoStr = format(sevenDaysAgo, 'yyyy-MM-dd')

  // Fetch data in parallel
  const [
    todayBookingsResponse,
    yesterdayBookingsResponse,
    totalEmployeesResponse,
    totalClientsResponse,
    recentBookingsResponse,
    completedBookingsTodayResponse,
    completedBookingsYesterdayResponse,
    last7DaysBookingsResponse,
    upcomingBookingsTodayResponse
  ] = await Promise.all([
    // Today's bookings count
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', typedSalon.id)
      .eq('booking_date', todayStr)
      .neq('status', 'cancelled'),

    // Yesterday's bookings count for trend
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', typedSalon.id)
      .eq('booking_date', yesterdayStr)
      .neq('status', 'cancelled'),

    // Total active employees
    supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', typedSalon.id)
      .eq('active', true),

    // Total clients
    supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', typedSalon.id),

    // Recent bookings (last 5 created)
    supabase
      .from('bookings')
      .select(`
        id, booking_date, booking_time, status,
        clients:clients (full_name),
        employees:employees (first_name, last_name),
        services:services (name)
      `)
      .eq('salon_id', typedSalon.id)
      .order('created_at', { ascending: false })
      .limit(5),

    // Today's revenue
    supabase
      .from('bookings')
      .select('total_price')
      .eq('salon_id', typedSalon.id)
      .eq('booking_date', todayStr)
      .eq('status', 'completed'),

    // Yesterday's revenue for trend
    supabase
      .from('bookings')
      .select('total_price')
      .eq('salon_id', typedSalon.id)
      .eq('booking_date', yesterdayStr)
      .eq('status', 'completed'),

    // Last 7 days bookings for charts
    supabase
      .from('bookings')
      .select(`
        id, total_price, booking_date, status,
        services:services (name)
      `)
      .eq('salon_id', typedSalon.id)
      .gte('booking_date', sevenDaysAgoStr)
      .neq('status', 'cancelled'),

    // Upcoming bookings for today
    supabase
      .from('bookings')
      .select(`
        id, booking_time, status,
        clients:clients (full_name),
        services:services (name)
      `)
      .eq('salon_id', typedSalon.id)
      .eq('booking_date', todayStr)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .order('booking_time', { ascending: true })
      .limit(5),

    // All employees for revenue breakdown
    supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('salon_id', typedSalon.id)
  ])

  const todayBookings = todayBookingsResponse.count
  const yesterdayBookings = yesterdayBookingsResponse.count
  const totalEmployees = totalEmployeesResponse.count
  const totalClients = totalClientsResponse.count

  const typedRecentBookings = (recentBookingsResponse.data as any[]) || []
  const typedCompletedBookingsToday = (completedBookingsTodayResponse.data as any[]) || []
  const typedCompletedBookingsYesterday = (completedBookingsYesterdayResponse.data as any[]) || []
  const typedLast7DaysBookings = (last7DaysBookingsResponse.data as any[]) || []
  const typedUpcomingBookings = (upcomingBookingsTodayResponse.data as any[]) || []
  const typedEmployees = (totalEmployeesResponse.data as any[]) || []

  // Process data for charts and stats
  const todayRevenue = typedCompletedBookingsToday?.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0) || 0
  const yesterdayRevenue = typedCompletedBookingsYesterday?.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0) || 0

  // Revenue trend calculation
  const revenueTrend = yesterdayRevenue > 0
    ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : todayRevenue > 0 ? 100 : 0

  // Bookings trend calculation
  const bookingTrend = (yesterdayBookings || 0) > 0
    ? Math.round((((todayBookings || 0) - yesterdayBookings!) / yesterdayBookings!) * 100)
    : (todayBookings || 0) > 0 ? 100 : 0

  // Revenue chart data (last 7 days)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = format(subDays(today, 6 - i), 'yyyy-MM-dd')
    const dailyRevenue = typedLast7DaysBookings
      ?.filter((b: any) => b.booking_date === date && b.status === 'completed')
      .reduce((sum: number, b: any) => sum + (Number(b.total_price) || 0), 0) || 0
    return {
      date: format(subDays(today, 6 - i), 'dd.MM'),
      amount: dailyRevenue
    }
  })

  // Services distribution data
  const serviceCounts: Record<string, number> = {}
  typedLast7DaysBookings?.forEach((b: any) => {
    const name = b.services?.name || 'Inne'
    serviceCounts[name] = (serviceCounts[name] || 0) + 1
  })

  const servicesData = Object.entries(serviceCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // Employee revenue data
  const employeeRevenue: Record<string, number> = {}
  typedLast7DaysBookings
    ?.filter((b: any) => b.status === 'completed')
    .forEach((b: any) => {
      const empId = b.employee_id
      if (empId) {
        employeeRevenue[empId] = (employeeRevenue[empId] || 0) + (Number(b.total_price) || 0)
      }
    })

  const employeeRevenueData = typedEmployees
    .map((emp: any) => ({
      name: `${emp.first_name} ${emp.last_name.charAt(0)}.`,
      amount: employeeRevenue[emp.id] || 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const stats = [
    {
      title: 'Dzisiejsze wizyty',
      value: todayBookings || 0,
      icon: Calendar,
      color: 'from-blue-600 to-cyan-600',
      lightColor: 'from-blue-50 to-cyan-50',
      trend: { value: Math.abs(bookingTrend), isPositive: bookingTrend >= 0 },
      description: 'vs wczoraj',
      href: `/${slug}/reports?tab=visits`
    },
    {
      title: 'Przychód dzisiaj',
      value: `${todayRevenue.toFixed(2)} zł`,
      icon: DollarSign,
      color: 'from-emerald-600 to-teal-600',
      lightColor: 'from-emerald-50 to-teal-50',
      trend: { value: Math.abs(revenueTrend), isPositive: revenueTrend >= 0 },
      description: 'vs wczoraj',
      href: `/${slug}/reports?tab=revenue`
    },
    {
      title: 'Aktywni pracownicy',
      value: totalEmployees || 0,
      icon: Users,
      color: 'from-purple-600 to-violet-600',
      lightColor: 'from-purple-50 to-violet-50',
      href: `/${slug}/reports?tab=employees`
    },
    {
      title: 'Baza klientów',
      value: totalClients || 0,
      icon: TrendingUp,
      color: 'from-pink-600 to-rose-600',
      lightColor: 'from-pink-50 to-rose-50',
      href: `/${slug}/reports?tab=clients`
    },
  ]

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-8 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-base font-medium">Witaj w {typedSalon?.name || 'salonie'}! Oto podsumowanie Twojej firmy.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${slug}/bookings`}>
            <Button size="lg" className="gradient-button rounded-xl h-12 px-6 font-bold flex gap-2">
              <Plus className="h-5 w-5" />
              Nowa wizyta
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={stat.title} {...stat} index={index} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <RevenueChart data={chartData} />

        {/* Quick Actions */}
        <div className="glass p-6 rounded-2xl flex flex-col h-full bg-white/50 backdrop-blur-sm border-none">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-600" />
            Szybkie akcje
          </h2>
          <div className="grid grid-cols-1 gap-3 flex-1">
            <Link href={`/${slug}/clients`} className="group">
              <div className="flex items-center gap-4 p-4 rounded-xl glass hover:bg-purple-100/50 transition-all border-none">
                <div className="p-3 rounded-lg bg-blue-100 text-blue-600 group-hover:scale-110 transition-transform">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Dodaj klienta</p>
                  <p className="text-sm text-muted-foreground">Powiększ swoją bazę</p>
                </div>
              </div>
            </Link>
            <Link href={`/${slug}/employees`} className="group">
              <div className="flex items-center gap-4 p-4 rounded-xl glass hover:bg-purple-100/50 transition-all border-none">
                <div className="p-3 rounded-lg bg-green-100 text-green-600 group-hover:scale-110 transition-transform">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Zarządzaj zespołem</p>
                  <p className="text-sm text-muted-foreground">Pracownicy i grafik</p>
                </div>
              </div>
            </Link>
            <Link href={`/${slug}/calendar`} className="group">
              <div className="flex items-center gap-4 p-4 rounded-xl glass hover:bg-purple-100/50 transition-all border-none">
                <div className="p-3 rounded-lg bg-amber-100 text-amber-600 group-hover:scale-110 transition-transform">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Kalendarz</p>
                  <p className="text-sm text-muted-foreground">Przeglądaj harmonogram</p>
                </div>
              </div>
            </Link>
            <Link href={`/${slug}/settings`} className="group">
              <div className="flex items-center gap-4 p-4 rounded-xl glass hover:bg-purple-100/50 transition-all border-none">
                <div className="p-3 rounded-lg bg-rose-100 text-rose-600 group-hover:scale-110 transition-transform">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Ustawienia</p>
                  <p className="text-sm text-muted-foreground">Konfiguracja salonu</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">

        {/* Employee Revenue Chart */}
        <EmployeeRevenueChart data={employeeRevenueData} />
      </div>

      <div className="grid gap-6 lg:grid-cols-1">

        {/* Upcoming Bookings */}
        <div className="glass p-6 rounded-2xl bg-card/50 backdrop-blur-sm border-none">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">Dzisiejsze wizyty</h2>
            <Link href={`/${slug}/calendar`} className="text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors">
              Zobacz wszystkie
            </Link>
          </div>
          {typedUpcomingBookings && typedUpcomingBookings.length > 0 ? (
            <div className="space-y-3">
              {typedUpcomingBookings.map((booking: any, index: number) => (
                <div
                  key={booking.id}
                  style={{ animationDelay: `${index * 50}ms` }}
                  className="flex items-center justify-between p-4 rounded-xl glass group hover:bg-card/80 transition-all duration-300 border-none animate-fade-in"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
                      {booking.clients?.full_name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-foreground group-hover:text-purple-600 transition-colors">{booking.clients?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{booking.services?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{booking.booking_time?.slice(0, 5)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="Brak wizyt na dzisiaj"
              description="Wygląda na to, że Twój grafik na dziś jest pusty. Zaplanuj nowe wizyty, aby zapełnić kalendarz!"
              className="py-12 bg-transparent shadow-none"
            />
          )}
        </div>
      </div>

      {/* Recent Activity Footnote */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400 pt-4">
        <Activity className="h-3 w-3" />
        <span>Dane aktualizowane w czasie rzeczywistym</span>
      </div>
    </div>
  )
}
