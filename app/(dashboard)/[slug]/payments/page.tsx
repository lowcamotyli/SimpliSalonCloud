import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalBaseUrl } from '@/lib/config/app-url'
import { PaymentStatusBadge } from '@/components/bookings/payment-status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Params = {
  slug: string
}

type SearchParams = {
  page?: string
  status?: string
}

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

type PaymentItem = {
  id: string
  bookingId: string
  clientName: string
  serviceName: string
  amount: number
  status: PaymentStatus
  paidAt: string | null
  createdAt: string | null
}

type PaymentsHistoryResponse = {
  payments: PaymentItem[]
  total: number
  page: number
  limit: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Wszystkie' },
  { value: 'paid', label: 'paid' },
  { value: 'pending', label: 'pending' },
  { value: 'failed', label: 'failed' },
  { value: 'refunded', label: 'refunded' },
] as const

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAmount(value: number): string {
  return `${value.toFixed(2)} zł`
}

function normalizeStatus(value: string | undefined): 'all' | PaymentStatus {
  if (!value || value === 'all') {
    return 'all'
  }

  const allowed: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded', 'cancelled']
  return allowed.includes(value as PaymentStatus) ? (value as PaymentStatus) : 'all'
}

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams?: Promise<SearchParams>
}): Promise<JSX.Element> {
  const { slug } = await params
  const resolvedSearchParams = (await searchParams) ?? {}
  const selectedStatus = normalizeStatus(resolvedSearchParams.status)
  const currentPage = parsePositiveInt(resolvedSearchParams.page, 1)

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const permissions = Array.isArray(user.app_metadata?.permissions)
    ? user.app_metadata.permissions.filter(
        (permission): permission is string => typeof permission === 'string'
      )
    : []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = profile?.role ?? null

  if (role === 'employee') {
    redirect(`/${slug}/dashboard`)
  }

  const hasFinancePermission = permissions.includes('*') || permissions.includes('finance:view')
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  if (!hasFinancePermission || !isOwnerOrManager) {
    redirect(`/${slug}/dashboard`)
  }

  const appUrl = getInternalBaseUrl()
  const cookieHeader = (await cookies()).toString()
  const query = new URLSearchParams({
    page: currentPage.toString(),
    limit: '20',
  })

  if (selectedStatus !== 'all') {
    query.set('status', selectedStatus)
  }

  const fetchUrl = `${appUrl}/api/payments/booking/history?${query.toString()}`
  console.log('[payments/page] fetching:', fetchUrl)
  const response = await fetch(fetchUrl, {
    headers: {
      cookie: cookieHeader,
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    throw new Error(`Failed to fetch payments history: HTTP ${response.status} at ${fetchUrl} — ${body}`)
  }

  const data = (await response.json()) as PaymentsHistoryResponse
  const payments = data.payments ?? []
  const total = data.total ?? 0
  const limit = data.limit ?? 20
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(Math.max(data.page ?? currentPage, 1), totalPages)

  const previousPageHref =
    selectedStatus === 'all'
      ? `/${slug}/payments?page=${Math.max(safePage - 1, 1)}`
      : `/${slug}/payments?page=${Math.max(safePage - 1, 1)}&status=${selectedStatus}`
  const nextPageHref =
    selectedStatus === 'all'
      ? `/${slug}/payments?page=${Math.min(safePage + 1, totalPages)}`
      : `/${slug}/payments?page=${Math.min(safePage + 1, totalPages)}&status=${selectedStatus}`

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Płatności online</h1>
          <p className="text-sm text-muted-foreground">Historia płatności za rezerwacje</p>
        </div>

        <form method="GET" className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={selectedStatus}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input type="hidden" name="page" value="1" />
          <Button type="submit" variant="outline">
            Filtruj
          </Button>
        </form>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Brak płatności online
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Klient</TableHead>
                <TableHead>Usługa</TableHead>
                <TableHead>Kwota</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDateTime(payment.paidAt ?? payment.createdAt)}</TableCell>
                  <TableCell>{payment.clientName}</TableCell>
                  <TableCell>{payment.serviceName}</TableCell>
                  <TableCell>{formatAmount(payment.amount)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge
                      status={payment.status}
                      amount={payment.status === 'paid' ? payment.amount : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/${slug}/bookings`}>Przejdź do rezerwacji</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        {safePage <= 1 ? (
          <Button variant="outline" disabled>
            Poprzednia
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={previousPageHref}>Poprzednia</Link>
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          Strona {safePage} z {totalPages}
        </p>

        {safePage >= totalPages ? (
          <Button variant="outline" disabled>
            Następna
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={nextPageHref}>Następna</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
