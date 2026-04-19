import type { JSX } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { AlertTriangle, BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

type BooksyStatusWidgetProps = {
  salonId: string
  salonSlug: string
}

type LastSyncRow = {
  finished_at: string | null
  triggered_by: string | null
}

function formatSyncAge(timestamp: string | null): string {
  if (!timestamp) {
    return 'brak'
  }

  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return 'brak'
  }

  return formatDistanceToNow(parsed, { addSuffix: true, locale: pl })
}

export async function BooksyStatusWidget({ salonId, salonSlug }: BooksyStatusWidgetProps): Promise<JSX.Element> {
  const adminSupabase = createAdminSupabaseClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [activeCountResult, lastSyncResult, todayBookingsResult, manualReviewCountResult, pendingEmailCountResult] = await Promise.all([
    (adminSupabase.from('booksy_gmail_accounts' as any) as any)
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('is_active', true),
    (adminSupabase.from('booksy_sync_logs' as any) as any)
      .select('finished_at, triggered_by')
      .eq('salon_id', salonId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('source', 'booksy')
      .eq('booking_date', today)
      .neq('status', 'cancelled'),
    (adminSupabase.from('booksy_parsed_events' as any) as any)
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('status', 'manual_review'),
    (adminSupabase.from('booksy_pending_emails' as any) as any)
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('status', 'pending'),
  ])

  const activeCount = activeCountResult.error ? 0 : activeCountResult.count ?? 0
  const lastSyncRow = lastSyncResult.error ? null : ((lastSyncResult.data as LastSyncRow | null) ?? null)
  const syncSource = lastSyncRow?.triggered_by === 'cron' ? 'auto' : lastSyncRow?.triggered_by === 'manual' ? 'ręczna' : lastSyncRow?.triggered_by === 'webhook' ? 'webhook' : null
  const todayBookingsCount = todayBookingsResult.error ? 0 : todayBookingsResult.count ?? 0
  const manualReviewCount = (manualReviewCountResult.error ? 0 : manualReviewCountResult.count ?? 0)
    + (pendingEmailCountResult.error ? 0 : pendingEmailCountResult.count ?? 0)
  const dotClass = activeCount > 0 ? 'bg-emerald-500' : 'bg-red-500'

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="text-sm font-semibold">Booksy</span>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-label="booksy-status-dot" />
        </div>

        <p className="text-xs text-muted-foreground">
          {activeCount} skrzynki · Sync: {formatSyncAge(lastSyncRow?.finished_at ?? null)}{syncSource ? ` (${syncSource})` : ''} · Dziś: {todayBookingsCount} rez.
        </p>

        {manualReviewCount > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium">{manualReviewCount} {manualReviewCount === 1 ? 'rezerwacja wymaga' : 'rezerwacji wymaga'} obsługi</span>
            </div>
            <div className="mt-1">
              <Link
                href={`/${salonSlug}/booksy#kolejka`}
                className="text-xs font-medium text-amber-800 hover:text-amber-900"
              >
                Przejdź do kolejki →
              </Link>
            </div>
          </div>
        ) : null}

        <div>
          <Link href={`/${salonSlug}/booksy`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Zobacz integrację →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
