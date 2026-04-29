'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, User, Scissors, CreditCard, Calendar, Clock, FileText } from 'lucide-react'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatPrice } from '@/lib/formatters'

type BookingDetail = {
  id: string
  booking_date: string
  booking_time: string
  duration: number
  status: string
  payment_method: string | null
  base_price: number
  surcharge: number
  total_price: number
  notes: string | null
  employee: { id: string; first_name: string; last_name: string | null } | null
  client: { id: string; full_name: string; phone: string } | null
  service: { id: string; name: string; price: number; duration: number } | null
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'secondary',
  confirmed: 'default',
  completed: 'default',
  cancelled: 'destructive',
  pending: 'outline',
  no_show: 'destructive',
}

function formatPolishDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function BookingDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function BookingDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const router = useRouter()

  const { data, isLoading, isError } = useQuery<{ booking: BookingDetail }>({
    queryKey: ['booking', id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${id}`)
      if (!res.ok) throw new Error('Nie udalo sie zaladowac wizyty')
      return res.json()
    },
    enabled: !!id,
  })

  if (isLoading) return <BookingDetailSkeleton />

  if (isError || !data?.booking) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Wróć
        </Button>
        <p className="text-muted-foreground">Nie udalo sie zaladowac wizyty.</p>
      </div>
    )
  }

  const b = data.booking
  const employeeName = b.employee
    ? `${b.employee.first_name}${b.employee.last_name ? ' ' + b.employee.last_name : ''}`
    : '—'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">
            {b.client?.full_name ?? 'Nieznany klient'}
          </h1>
          <Badge variant={STATUS_VARIANT[b.status] ?? 'outline'}>
            {BOOKING_STATUS_LABELS[b.status] ?? b.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Szczegoly wizyty
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{formatPolishDate(b.booking_date)}</p>
            <p className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {b.booking_time.slice(0, 5)} · {b.duration} min
            </p>
            {b.service && <p className="font-medium">{b.service.name}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              Klient
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{b.client?.full_name ?? '—'}</p>
            {b.client?.phone && (
              <a href={`tel:${b.client.phone}`} className="text-muted-foreground hover:underline">
                {b.client.phone}
              </a>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Scissors className="h-4 w-4" />
              Pracownik
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{employeeName}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              Platnosc
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{formatPrice(b.total_price)}</p>
            {b.surcharge > 0 && (
              <p className="text-muted-foreground text-xs">
                Cena bazowa: {formatPrice(b.base_price)} + doplata: {formatPrice(b.surcharge)}
              </p>
            )}
            {b.payment_method && (
              <p className="text-muted-foreground">
                {PAYMENT_METHOD_LABELS[b.payment_method] ?? b.payment_method}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {b.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              Notatki
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{b.notes}</CardContent>
        </Card>
      )}
    </div>
  )
}
