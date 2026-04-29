import type { JSX } from 'react'
import { redirect } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { AddMailboxButton } from '@/components/integrations/booksy/AddMailboxButton'
import { BooksySyncOptions, type BooksySyncOptionsValue } from '@/components/integrations/booksy/BooksySyncOptions'
import { BooksyRecentBookingsTable } from '@/components/integrations/booksy/BooksyRecentBookingsTable'
import { MailboxList } from '@/components/integrations/booksy/MailboxList'
import { MailboxEmailActivity } from '@/components/integrations/booksy/MailboxEmailActivity'
import { BooksyPendingEmails } from '@/components/settings/booksy-pending-emails'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonHealth } from '@/lib/booksy/health-check'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AlertTriangle, BookOpen, Calendar, CheckCircle2 } from 'lucide-react'

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

type BooksySettingsRow = {
  booksy_sync_interval_minutes: number | null
  booksy_sender_filter: string | null
  booksy_sync_from_date: string | null
  booksy_auto_create_clients: boolean | null
  booksy_auto_create_services: boolean | null
}

type BookingRow = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  base_price: number | null
  client_id: string | null
  service_id: string | null
  employee_id: string | null
  clients: { full_name: string } | null
  services: { name: string } | null
  employees: { first_name: string; last_name: string | null } | null
}

function getOauthErrorCopy(errorCode?: string): { title: string; description: string } | null {
  if (!errorCode) {
    return null
  }

  if (errorCode === 'missing_booksy_token_encryption_key') {
    return {
      title: 'Nie mozna zapisac skrzynki Gmail',
      description:
        'Brakuje zmiennej srodowiskowej BOOKSY_TOKEN_ENCRYPTION_KEY. Dodaj 64-znakowy klucz hex do env i ponow autoryzacje.',
    }
  }

  if (errorCode === 'missing_google_refresh_token') {
    return {
      title: 'Google nie zwrocilo refresh tokena',
      description:
        'Sprobuj ponownie autoryzowac skrzynke i upewnij sie, ze zgoda Google jest wymuszona dla konta Gmail.',
    }
  }

  if (errorCode === 'booksy_mailbox_table_permission_denied') {
    return {
      title: 'Brak uprawnien do zapisu skrzynki Booksy',
      description:
        'Callback OAuth nie mogl zapisac rekordu skrzynki w bazie. Aplikacja uzyje teraz zapisu przez klient admin po weryfikacji sesji.',
    }
  }

  return {
    title: 'Autoryzacja Gmail nie powiodla sie',
    description: decodeURIComponent(errorCode),
  }
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
  searchParams,
}: {
  params: Promise<Params>
  searchParams?: Promise<{ error?: string }>
}): Promise<JSX.Element> {
  const { slug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const oauthError = getOauthErrorCopy(resolvedSearchParams?.error)
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
  const [health, lastSyncResult, bookingsResult, settingsResult] = await Promise.all([
    getSalonHealth(salonId, supabase),
    (adminSupabase.from('booksy_sync_logs' as any) as any)
      .select('finished_at, emails_success, emails_error, triggered_by')
      .eq('salon_id', salonId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from('bookings')
      .select('id,booking_date,booking_time,status,base_price,client_id,service_id,employee_id,clients(full_name),services(name),employees(first_name,last_name)')
      .eq('salon_id', salonId)
      .eq('source', 'booksy')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('salon_settings')
      .select('*')
      .eq('salon_id', salonId)
      .maybeSingle(),
  ])

  if (bookingsResult.error) {
    throw new Error(`Failed to load Booksy bookings: ${bookingsResult.error.message}`)
  }

  if (lastSyncResult.error) {
    throw new Error(`Failed to load Booksy sync logs: ${lastSyncResult.error.message}`)
  }
  if (settingsResult.error) {
    throw new Error(`Failed to load Booksy settings: ${settingsResult.error.message}`)
  }

  const typedHealth = health as SalonHealth
  const lastSync = (lastSyncResult.data as BooksySyncLogRow | null) ?? null
  const bookings = (bookingsResult.data ?? []) as BookingRow[]
  const settingsRow = settingsResult.data as BooksySettingsRow | null
  const booksySettings: BooksySyncOptionsValue = {
    booksy_sync_interval_minutes: settingsRow?.booksy_sync_interval_minutes ?? 15,
    booksy_sender_filter: settingsRow?.booksy_sender_filter ?? 'noreply@booksy.com',
    booksy_sync_from_date: settingsRow?.booksy_sync_from_date ?? '',
    booksy_auto_create_clients: settingsRow?.booksy_auto_create_clients ?? true,
    booksy_auto_create_services: settingsRow?.booksy_auto_create_services ?? false,
  }
  const activeAccounts = accounts.filter((account) => account.is_active).length
  const accordionDefaultValue = ['mailboxes', 'bookings', 'queue']

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-8 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Booksy</h1>
          <p className="text-muted-foreground">Synchronizacja rezerwacji z platformy Booksy</p>
        </div>
        <AddMailboxButton salonSlug={slug} />
      </div>

      {oauthError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{oauthError.title}</AlertTitle>
          <AlertDescription>{oauthError.description}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-border bg-card shadow-sm">
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

        <Card className="rounded-2xl border border-border bg-card shadow-sm">
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

        <Card className="rounded-2xl border border-border bg-card shadow-sm">
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

      <Accordion type="multiple" defaultValue={accordionDefaultValue} className="space-y-4">
        <AccordionItem value="mailboxes" className="rounded-2xl border border-border bg-card px-5">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              Skrzynki i status integracji
              <Badge variant="outline">{accounts.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <MailboxList mailboxes={accounts} health={typedHealth} salonSlug={slug} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="settings" className="rounded-2xl border border-border bg-card px-5">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2 text-base font-semibold">Ustawienia synchronizacji</div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <BooksySyncOptions salonId={salonId} initialSettings={booksySettings} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="queue" id="kolejka" className="rounded-2xl border border-border bg-card px-5">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2 text-base font-semibold">Kolejka obsługi i aktywność maili</div>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <BooksyPendingEmails salonId={salonId} />
            <MailboxEmailActivity salonId={salonId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bookings" className="rounded-2xl border border-border bg-card px-5">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              Ostatnie rezerwacje z Booksy
              <Badge variant="outline">{bookings.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <BooksyRecentBookingsTable bookings={bookings} slug={slug} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
