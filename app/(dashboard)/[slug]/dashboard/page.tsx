import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Users, DollarSign, TrendingUp, Plus, Clock } from 'lucide-react'
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
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Aktywni pracownicy',
      value: totalEmployees || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Baza klientów',
      value: totalClients || 0,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Przychód dzisiaj',
      value: `${todayRevenue.toFixed(2)} zł`,
      icon: DollarSign,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-600">
          Witaj! Oto podsumowanie Twojego salonu.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader className={`pb-2 ${stat.bgColor}`}>
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                  {stat.title}
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <Card className="border-2 border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="text-lg">Szybkie akcje</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href={`/${params.slug}/bookings`}>
              <Button className="w-full h-auto py-4 flex-col gap-2 bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
                <Plus className="h-5 w-5" />
                <span>Nowa wizyta</span>
              </Button>
            </Link>
            <Link href={`/${params.slug}/clients`}>
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Users className="h-5 w-5" />
                <span>Dodaj klienta</span>
              </Button>
            </Link>
            <Link href={`/${params.slug}/employees`}>
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Clock className="h-5 w-5" />
                <span>Zarządzaj pracownikami</span>
              </Button>
            </Link>
            <Link href={`/${params.slug}/calendar`}>
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Calendar className="h-5 w-5" />
                <span>Przejdź do kalendarza</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Bookings */}
      <Card>
        <CardHeader>
          <CardTitle>Ostatnie rezerwacje</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBookings && recentBookings.length > 0 ? (
            <div className="space-y-3">
              {recentBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between rounded-lg border border-purple-100 bg-gradient-to-r from-purple-50 to-transparent p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex-1">
                    {/* @ts-ignore */}
                    <p className="font-semibold text-gray-900">{booking.clients?.full_name}</p>
                    {/* @ts-ignore */}
                    <p className="text-sm text-gray-600">{booking.services?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{booking.booking_date}</p>
                    <p className="text-sm text-gray-500">{booking.booking_time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">Brak rezerwacji</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
