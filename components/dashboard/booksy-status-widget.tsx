import type { JSX } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

type BooksyStatusWidgetProps = {
  salonId: string
  salonSlug: string
}

type LastSyncRow = {
  finished_at: string | null
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

  const [activeCountResult, lastSyncResult, todayBookingsResult] = await Promise.all([
    (adminSupabase.from('booksy_gmail_accounts' as any) as any)
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('is_active', true),
    (adminSupabase.from('booksy_sync_logs' as any) as any)
      .select('finished_at')
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
  ])

  const activeCount = activeCountResult.error ? 0 : activeCountResult.count ?? 0
  const lastSyncRow = lastSyncResult.error ? null : ((lastSyncResult.data as LastSyncRow | null) ?? null)
  const todayBookingsCount = todayBookingsResult.error ? 0 : todayBookingsResult.count ?? 0
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
          {activeCount} skrzynki · Sync: {formatSyncAge(lastSyncRow?.finished_at ?? null)} · Dziś: {todayBookingsCount} rez.
        </p>

        <div>
          <Link href={`/${salonSlug}/booksy`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Zobacz integrację →
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
