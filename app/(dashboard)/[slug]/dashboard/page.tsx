import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Users, DollarSign, TrendingUp, Plus, Clock, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage({ params }: { params: { slug: string } }) {
  const supabase = await createServerSupabaseClient()

  // Get salon ID from slug
  const { data: salon } = await supabase
    .from('salons')
    .select('id')
    .eq('slug', params.slug)
    .single()

  if (!salon) {
    return <div>Salon nie znaleziony</div>
  }

  // Fetch stats
  const today = new Date().toISOString().split('T')[0]

  const [
    { count: todayBookings },
    { count: totalEmployees },
    { count: totalClients },
    { data: recentBookings },
    { data: completedBookingsToday }
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', salon.id)
      .eq('booking_date', today)
      .neq('status', 'cancelled'),
    
    supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', salon.id)
      .eq('active', true),
    
    supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('salon_id', salon.id),
    
    supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        booking_time,
        status,
        clients (full_name),
        employees (first_name, last_name),
        services (name)
      `)
      .eq('salon_id', salon.id)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('bookings')
      .select('total_price')
      .eq('salon_id', salon.id)
      .eq('booking_date', today)
      .eq('status', 'completed')
  ])

  const todayRevenue = completedBookingsToday?.reduce((sum, b) => sum + (b.total_price || 0), 0) || 0

  const stats = [
    {
      title: 'Dzisiejsze wizyty',
      value: todayBookings || 0,
      icon: Calendar,
      color: 'from-blue-600 to-cyan-600',
      lightColor: 'from-blue-50 to-cyan-50',
    },
    {
      title: 'Aktywni pracownicy',
      value: totalEmployees || 0,
      icon: Users,
      color: 'from-green-600 to-emerald-600',
      lightColor: 'from-green-50 to-emerald-50',
    },
    {
      title: 'Baza klientów',
      value: totalClients || 0,
      icon: TrendingUp,
      color: 'from-purple-600 to-violet-600',
      lightColor: 'from-purple-50 to-violet-50',
    },
    {
      title: 'Przychód dzisiaj',
      value: `${todayRevenue.toFixed(2)} zł`,
      icon: DollarSign,
      color: 'from-pink-600 to-rose-600',
      lightColor: 'from-pink-50 to-rose-50',
    },
  ]

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-5xl font-bold gradient-text">Dashboard</h1>
        <p className="text-gray-600 text-lg">Witaj! Oto podsumowanie Twojego salonu.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              style={{
                animationDelay: `${index * 100}ms`,
              }}
              className="animate-fade-in"
            >
              <Card className="stat-card overflow-hidden group">
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.lightColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <CardHeader className="relative pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color} text-white shadow-lg group-hover:shadow-xl transition-all`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative pt-4">
                  <div className={`text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                    {stat.value}
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-xs text-green-600 font-semibold">
                    <ArrowUpRight className="h-3 w-3" />
                    +12% od wczoraj
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Szybkie akcje</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={`/${params.slug}/bookings`}>
            <Button className="w-full h-auto py-4 flex-col gap-2 gradient-button rounded-xl shadow-lg hover:shadow-xl transition-all">
              <Plus className="h-6 w-6" />
              <span className="font-semibold">Nowa wizyta</span>
            </Button>
          </Link>
          <Link href={`/${params.slug}/clients`}>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2 rounded-xl glass hover:shadow-lg transition-all">
              <Users className="h-6 w-6 text-purple-600" />
              <span className="font-semibold text-gray-900">Dodaj klienta</span>
            </Button>
          </Link>
          <Link href={`/${params.slug}/employees`}>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2 rounded-xl glass hover:shadow-lg transition-all">
              <Clock className="h-6 w-6 text-purple-600" />
              <span className="font-semibold text-gray-900">Pracownicy</span>
            </Button>
          </Link>
          <Link href={`/${params.slug}/calendar`}>
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2 rounded-xl glass hover:shadow-lg transition-all">
              <Calendar className="h-6 w-6 text-purple-600" />
              <span className="font-semibold text-gray-900">Kalendarz</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent Bookings */}
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Ostatnie rezerwacje</h2>
        {recentBookings && recentBookings.length > 0 ? (
          <div className="space-y-3">
            {recentBookings.map((booking, index) => (
              <div
                key={booking.id}
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
                className="flex items-center justify-between p-4 rounded-xl glass group hover:shadow-lg transition-all duration-300 cursor-pointer"
              >
                <div className="flex-1">
                  {/* @ts-ignore */}
                  <p className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">{booking.clients?.full_name}</p>
                  {/* @ts-ignore */}
                  <p className="text-sm text-gray-500">{booking.services?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{booking.booking_date}</p>
                  <p className="text-sm text-gray-500">{booking.booking_time}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Brak rezerwacji</p>
          </div>
        )}
      </div>
    </div>
  )
}
