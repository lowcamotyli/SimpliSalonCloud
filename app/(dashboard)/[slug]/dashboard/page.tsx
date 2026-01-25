import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Users, DollarSign, TrendingUp } from 'lucide-react'

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
    { data: recentBookings }
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
      .limit(5)
  ])

  const stats = [
    {
      title: 'Dzisiejsze wizyty',
      value: todayBookings || 0,
      icon: Calendar,
      color: 'text-blue-600',
    },
    {
      title: 'Aktywni pracownicy',
      value: totalEmployees || 0,
      icon: Users,
      color: 'text-green-600',
    },
    {
      title: 'Klienci',
      value: totalClients || 0,
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      title: 'Przychód miesiąca',
      value: '0 zł', // TODO: Calculate from completed bookings
      icon: DollarSign,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Witaj! Oto podsumowanie Twojego salonu.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

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
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    {/* @ts-ignore */}
                    <p className="font-medium">{booking.clients?.full_name}</p>
                    {/* @ts-ignore */}
                    <p className="text-sm text-gray-600">{booking.services?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{booking.booking_date}</p>
                    <p className="text-sm text-gray-600">{booking.booking_time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500">Brak rezerwacji</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}