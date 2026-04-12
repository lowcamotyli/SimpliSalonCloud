import { redirect } from 'next/navigation'
import { AddMailboxButton } from '@/components/integrations/booksy/AddMailboxButton'
import { BooksySyncOptions, type BooksySyncOptionsValue } from '@/components/integrations/booksy/BooksySyncOptions'
import { MailboxList } from '@/components/integrations/booksy/MailboxList'
import { BooksyPendingEmails } from '@/components/settings/booksy-pending-emails'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getSalonHealth } from '@/lib/booksy/health-check'
import { AlertTriangle, Calendar, ChevronRight, Info, RefreshCw } from 'lucide-react'

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

type BooksyLog = {
  id: string
  booking_date: string
  booking_time: string
  status: string
  created_at: string
  base_price: number
  clients: { full_name: string; phone: string } | null
  employees: { first_name: string; last_name: string | null } | null
  services: { name: string } | null
}

type BooksyLogsResponse = {
  bookings: BooksyLog[]
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

type BooksySettingsRow = {
  booksy_sync_interval_minutes: number | null
  booksy_sender_filter: string | null
  booksy_sync_from_date: string | null
  booksy_auto_create_clients: boolean | null
  booksy_auto_create_services: boolean | null
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

function statusBadge(status: string) {
  if (status === 'scheduled') {
    return (
      <Badge variant="default" className="text-xs">
        Zaplanowana
      </Badge>
    )
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

function mapMailboxAuthStatus(account: BooksyMailboxRow): MailboxAccount['auth_status'] {
  if (!account.is_active) {
    return 'disconnected'
  }

  return account.auth_status === 'active' ? 'connected' : 'reauth_required'
}


export default async function BooksySettingsPage({
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
    redirect(`/${salon.slug}/settings/integrations/booksy`)
  }

  const { data: accountsData, error: accountsError } = await (supabase
    .from('booksy_gmail_accounts') as any)
    .select('id, gmail_email, mailbox_label, auth_status, is_active, is_primary, created_at')
    .eq('salon_id', typedProfile.salon_id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (accountsError) {
    throw new Error(`Failed to load Booksy mailboxes: ${accountsError.message}`)
  }

  const accounts = ((accountsData ?? []) as BooksyMailboxRow[]).map((account) => ({
    id: account.id,
    gmail_email: account.gmail_email,
    mailbox_label: account.mailbox_label,
    auth_status: mapMailboxAuthStatus(account),
    is_active: account.is_active,
    is_primary: account.is_primary,
    created_at: account.created_at,
  }))
  const adminSupabase = createAdminSupabaseClient()
  const [health, logsResult, settingsResult] = await Promise.all([
    getSalonHealth(typedProfile.salon_id, supabase),
    adminSupabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, created_at, base_price, clients(full_name, phone), employees(first_name, last_name), services(name)')
      .eq('salon_id', typedProfile.salon_id)
      .eq('source', 'booksy')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('salon_settings')
      .select('*')
      .eq('salon_id', typedProfile.salon_id)
      .maybeSingle(),
  ])
  if (settingsResult.error) {
    throw new Error(`Failed to load Booksy settings: ${settingsResult.error.message}`)
  }

  const logsData: BooksyLogsResponse = { bookings: logsResult.data ?? [] }
  const settingsRow = settingsResult.data as BooksySettingsRow | null
  const booksySettings: BooksySyncOptionsValue = {
    booksy_sync_interval_minutes: settingsRow?.booksy_sync_interval_minutes ?? 15,
    booksy_sender_filter: settingsRow?.booksy_sender_filter ?? 'noreply@booksy.com',
    booksy_sync_from_date: settingsRow?.booksy_sync_from_date ?? '',
    booksy_auto_create_clients: settingsRow?.booksy_auto_create_clients ?? true,
    booksy_auto_create_services: settingsRow?.booksy_auto_create_services ?? false,
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integracja Booksy</h1>
          <p className="mt-1 text-muted-foreground">
            Zarzadzaj wieloma skrzynkami Gmail dla synchronizacji rezerwacji z Booksy.
          </p>
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

      <MailboxList mailboxes={accounts} health={health} salonSlug={slug} />

      <BooksySyncOptions salonId={typedProfile.salon_id} initialSettings={booksySettings} />

      <BooksyPendingEmails salonId={typedProfile.salon_id} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-sky-500" />
              Ostatnie rezerwacje z Booksy
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
              <a href={`/${slug}/settings/integrations/booksy`}>
                <RefreshCw className="h-3 w-3" />
                Odswiez
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!logsData.bookings?.length ? (
            <p className="py-6 text-center text-sm text-gray-500">Brak przetworzonych rezerwacji z Booksy</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="pb-2 text-left font-medium">Data wizyty</th>
                    <th className="pb-2 text-left font-medium">Klient</th>
                    <th className="pb-2 text-left font-medium">Usluga</th>
                    <th className="pb-2 text-left font-medium">Pracownik</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Cena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logsData.bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-gray-600">
                        {new Date(`${booking.booking_date}T${booking.booking_time}`).toLocaleString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-gray-900">{booking.clients?.full_name ?? '-'}</p>
                        <p className="text-xs text-gray-400">{booking.clients?.phone}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">{booking.services?.name ?? '-'}</td>
                      <td className="py-2.5 pr-4 text-gray-700">
                        {booking.employees
                          ? `${booking.employees.first_name} ${booking.employees.last_name}`
                          : '-'}
                      </td>
                      <td className="py-2.5 pr-4">{statusBadge(booking.status)}</td>
                      <td className="whitespace-nowrap py-2.5 text-right text-gray-700">
                        {booking.base_price ? `${booking.base_price.toFixed(2)} zl` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-5 w-5 text-gray-400" />
            Jak dziala integracja?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {[
            {
              step: '1',
              title: 'Podlacz skrzynki Gmail',
              desc: 'Kazda skrzynka obsluguje niezalezne powiadomienia Booksy dla Twojego salonu.',
            },
            {
              step: '2',
              title: 'Monitoruj stan skrzynek',
              desc: 'Lista skrzynek pokazuje zdrowie autoryzacji, watch status i opoznienia powiadomien.',
            },
            {
              step: '3',
              title: 'Synchronizacja rezerwacji',
              items: [
                'Nowa rezerwacja tworzy wizyte w kalendarzu',
                'Zmiana terminu aktualizuje istniejaca wizyte',
                'Anulowanie oznacza wizyte jako anulowana',
              ],
            },
            {
              step: '4',
              title: 'Bezpieczenstwo danych',
              items: [
                'Kazda skrzynka jest przypisana do konkretnego salonu',
                'Widok laduje tylko dane dla salon_id zalogowanego operatora',
                'Stan zdrowia jest pobierany serwerowo z uwierzytelnionego endpointu',
              ],
            },
          ].map(({ step, title, desc, items }) => (
            <div key={step} className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                {step}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{title}</h4>
                {desc ? <p className="mt-0.5 text-xs">{desc}</p> : null}
                {items ? (
                  <ul className="mt-1 space-y-0.5">
                    {items.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
