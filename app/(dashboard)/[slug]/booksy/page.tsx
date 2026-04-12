import type { JSX } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { AddMailboxButton } from '@/components/integrations/booksy/AddMailboxButton'
import { MailboxList } from '@/components/integrations/booksy/MailboxList'
import { MailboxEmailActivity } from '@/components/integrations/booksy/MailboxEmailActivity'
import { BooksyPendingEmails } from '@/components/settings/booksy-pending-emails'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonHealth } from '@/lib/booksy/health-check'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AlertTriangle, BookOpen, Calendar, CheckCircle2, ChevronRight } from 'lucide-react'

type Params = {
  slug: string
}

type ProfileWithSalon = {
  salon_id: string
  salons: {
    id: string
    slug: string
    name: string
  } | null
}

type BooksyMailboxRow = {
  id: string
  gmail_email: string
  mailbox_label: string | null
  auth_status: 'active' | 'revoked' | 'expired' | 'error'
  is_active: boolean
  is_primary: boolean
  created_at: string
}

type MailboxAccount = {
  id: string
  gmail_email: string
  mailbox_label: string | null
  auth_status: 'connected' | 'reauth_required' | 'disconnected'
  is_active: boolean
  is_primary: boolean
  created_at: string
}

type MailboxHealth = {
  accountId: string
  email: string
  authStatus: 'active' | 'revoked' | 'expired' | 'error'
  watchStatus: 'active' | 'expired' | 'error' | 'pending' | 'stopped' | null
  watchExpiresAt: string | null
  lastNotificationAt: string | null
  rawBacklog: number
  parseFailureRate: number
  manualQueueDepth: number
  applyFailures: number
  lastReconciliationMissing: number | null
  overall: 'ok' | 'warning' | 'critical'
}

type SalonHealth = {
  overall: 'ok' | 'warning' | 'critical'
  mailboxes: MailboxHealth[]
}

type BooksySyncLogRow = {
  finished_at: string | null
  emails_success: number | null
  emails_error: number | null
  triggered_by: string | null
}

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  base_price: number | null
  clients: { full_name: string } | null
  services: { name: string } | null
  employees: { first_name: string; last_name: string | null } | null
}

function mapMailboxAuthStatus(account: BooksyMailboxRow): MailboxAccount['auth_status'] {
  if (!account.is_active) {
    return 'disconnected'
  }

  return account.auth_status === 'active' ? 'connected' : 'reauth_required'
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) {
    return 'brak'
  }

  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return 'brak'
  }

  return formatDistanceToNow(parsed, { addSuffix: true, locale: pl })
}

function statusBadge(status: string): JSX.Element {
  if (status === 'scheduled') {
    return <Badge className="text-xs">Zaplanowana</Badge>
  }

  if (status === 'cancelled') {
    return (
      <Badge variant="destructive" className="text-xs">
        Anulowana
      </Badge>
    )
  }

  if (status === 'completed') {
    return (
      <Badge variant="secondary" className="text-xs">
        Zakonczona
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="text-xs">
      {status}
    </Badge>
  )
}

function healthBadgeClass(health: SalonHealth['overall']): string {
  if (health === 'ok') {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }

  if (health === 'warning') {
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }

  return 'bg-red-100 text-red-700 border-red-200'
}

export default async function BooksyDashboardPage({
  params,
}: {
  params: Promise<Params>
}): Promise<JSX.Element> {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      `
        salon_id,
        salons!profiles_salon_id_fkey (
          id,
          slug,
          name
        )
      `
    )
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login?error=no_profile')
  }

  const typedProfile = profile as ProfileWithSalon
  const salon = typedProfile.salons

  if (!typedProfile.salon_id || !salon) {
    redirect('/login?error=no_salon')
  }

  if (salon.slug !== slug) {
    redirect(`/${salon.slug}/booksy`)
  }

  const salonId = typedProfile.salon_id

  const { data: accountsData, error: accountsError } = await (supabase.from('booksy_gmail_accounts' as any) as any)
    .select('id, gmail_email, mailbox_label, auth_status, is_active, is_primary, created_at')
    .eq('salon_id', salonId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (accountsError) {
    throw new Error(`Failed to load Booksy mailboxes: ${accountsError.message}`)
  }

  const accounts: MailboxAccount[] = ((accountsData ?? []) as BooksyMailboxRow[]).map((account) => ({
    id: account.id,
    gmail_email: account.gmail_email,
    mailbox_label: account.mailbox_label,
    auth_status: mapMailboxAuthStatus(account),
    is_active: account.is_active,
    is_primary: account.is_primary,
    created_at: account.created_at,
  }))

  const adminSupabase = createAdminSupabaseClient()
  const [health, lastSyncResult, bookingsResult] = await Promise.all([
    getSalonHealth(salonId, supabase),
    (adminSupabase.from('booksy_sync_logs' as any) as any)
      .select('finished_at, emails_success, emails_error, triggered_by')
      .eq('salon_id', salonId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from('bookings')
      .select('id,booking_date,booking_time,status,base_price,clients(full_name),services(name),employees(first_name,last_name)')
      .eq('salon_id', salonId)
      .eq('source', 'booksy')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (bookingsResult.error) {
    throw new Error(`Failed to load Booksy bookings: ${bookingsResult.error.message}`)
  }

  if (lastSyncResult.error) {
    throw new Error(`Failed to load Booksy sync logs: ${lastSyncResult.error.message}`)
  }

  const typedHealth = health as SalonHealth
  const lastSync = (lastSyncResult.data as BooksySyncLogRow | null) ?? null
  const bookings = (bookingsResult.data ?? []) as BookingRow[]
  const activeAccounts = accounts.filter((account) => account.is_active).length

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Booksy</h1>
          <p className="text-muted-foreground">Synchronizacja rezerwacji z platformy Booksy</p>
        </div>
        <AddMailboxButton salonSlug={slug} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Aktywne skrzynki
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeAccounts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Ostatnia sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatRelativeTime(lastSync?.finished_at ?? null)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={healthBadgeClass(typedHealth.overall)}>
              {typedHealth.overall}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {typedHealth.overall === 'critical' ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Problem z integracja</AlertTitle>
          <AlertDescription>Sprawdz stan skrzynek Gmail.</AlertDescription>
        </Alert>
      ) : null}

      {typedHealth.overall === 'warning' ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Uwaga</AlertTitle>
          <AlertDescription>Niektore skrzynki wymagaja uwagi.</AlertDescription>
        </Alert>
      ) : null}

      <MailboxList mailboxes={accounts} health={typedHealth} salonSlug={slug} />

      <BooksyPendingEmails salonId={salonId} />

      <MailboxEmailActivity salonId={salonId} />

      <Card>
        <CardHeader>
          <CardTitle>Ostatnie rezerwacje z Booksy</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p>Brak rezerwacji</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Data wizyty</th>
                    <th className="pb-2 text-left font-medium">Klient</th>
                    <th className="pb-2 text-left font-medium">Usluga</th>
                    <th className="pb-2 text-left font-medium">Pracownik</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                        {new Date(`${booking.booking_date}T${booking.booking_time}`).toLocaleString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 pr-4">{booking.clients?.full_name ?? '-'}</td>
                      <td className="py-2.5 pr-4">{booking.services?.name ?? '-'}</td>
                      <td className="py-2.5 pr-4">
                        {booking.employees
                          ? `${booking.employees.first_name} ${booking.employees.last_name ?? ''}`.trim()
                          : '-'}
                      </td>
                      <td className="py-2.5 pr-4">{statusBadge(booking.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Link
          href={`/${slug}/settings/integrations/booksy`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Zaawansowane ustawienia synchronizacji <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
