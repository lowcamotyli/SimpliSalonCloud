import Link from 'next/link'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getAppUrl } from '@/lib/config/app-url'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

type PageParams = {
  slug: string
  id: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  }).format(amount)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function formatTime(value: string): string {
  return value.slice(0, 5)
}

async function initiateBookingPayment(formData: FormData): Promise<void> {
  'use server'

  const slug = formData.get('slug')
  const bookingId = formData.get('bookingId')

  if (typeof slug !== 'string' || typeof bookingId !== 'string' || !slug || !bookingId) {
    return
  }

  const appUrl = getAppUrl()
  const returnUrl = `${appUrl}/${slug}/bookings/${bookingId}/payment`
  const cookieHeader = cookies().toString()

  const response = await fetch(`${appUrl}/api/payments/booking/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
    },
    body: JSON.stringify({
      bookingId,
      returnUrl,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    revalidatePath(`/${slug}/bookings/${bookingId}/payment`)
    return
  }

  const data = (await response.json()) as { paymentUrl?: string }

  if (data.paymentUrl) {
    redirect(data.paymentUrl)
  }

  revalidatePath(`/${slug}/bookings/${bookingId}/payment`)
}

export default async function BookingPaymentPage({
  params,
}: {
  params: Promise<PageParams>
}): Promise<JSX.Element> {
  const { slug, id } = await params
  const admin = createAdminSupabaseClient()

  const { data: salon, error: salonError } = await admin
    .from('salons')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (salonError || !salon) {
    notFound()
  }

  const salonId = salon.id

  const [{ data: booking, error: bookingError }, { data: payment, error: paymentError }] = await Promise.all([
    admin
      .from('bookings')
      .select('id, salon_id, booking_date, booking_time, base_price, total_price, service:services(name)')
      .eq('id', id)
      .eq('salon_id', salonId)
      .maybeSingle(),
    admin
      .from('booking_payments')
      .select('status, amount, paid_at, payment_url, created_at')
      .eq('booking_id', id)
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (bookingError || !booking) {
    notFound()
  }

  if (paymentError) {
    throw paymentError
  }

  const bookingAmount = Number(booking.total_price ?? booking.base_price ?? 0)
  const paymentAmount = Number(payment?.amount ?? bookingAmount)
  const paymentStatus = payment?.status ?? 'none'
  const paymentDate = payment?.paid_at ? formatDate(payment.paid_at) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">Platnosc za wizyte</h1>
        <p className="mt-2 text-sm text-muted-foreground">Zarzadzaj platnoscia dla tej rezerwacji.</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Podsumowanie wizyty</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Usluga</p>
            <p className="font-medium">{(booking.service as { name?: string } | null)?.name ?? 'Brak uslugi'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Data</p>
            <p className="font-medium">{formatDate(booking.booking_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Godzina</p>
            <p className="font-medium">{formatTime(booking.booking_time)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Kwota</p>
            <p className="font-medium">{formatCurrency(bookingAmount)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        {paymentStatus === 'paid' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Platnosc zakonczona</h2>
            </div>
            <p className="text-sm text-muted-foreground">Kwota: {formatCurrency(paymentAmount)}</p>
            {paymentDate && <p className="text-sm text-muted-foreground">Data: {paymentDate}</p>}
          </div>
        )}

        {paymentStatus === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <CreditCard className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Platnosc oczekuje</h2>
            </div>
            <Button asChild>
              <Link href={payment?.payment_url ?? '#'}>Przejdz do platnosci</Link>
            </Button>
          </div>
        )}

        {(paymentStatus === 'failed' || paymentStatus === 'cancelled') && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Platnosc nie powiodla sie</h2>
            </div>
            <form action={initiateBookingPayment}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="bookingId" value={id} />
              <Button type="submit">Sprobuj ponownie</Button>
            </form>
          </div>
        )}

        {paymentStatus === 'none' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Brak platnosci</h2>
            <form action={initiateBookingPayment}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="bookingId" value={id} />
              <Button type="submit">Zainicjuj platnosc</Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  )
}
