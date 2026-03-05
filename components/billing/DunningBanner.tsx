import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

type DunningBannerProps = {
  salonId: string
  slug: string
}

type PastDueSubscription = {
  status: string
  next_retry_at: string | null
  dunning_attempt: number | null
  current_period_end: string | null
}

function getDaysLeft(currentPeriodEnd: string | null): number | null {
  if (!currentPeriodEnd) return null

  const endMs = new Date(currentPeriodEnd).getTime()
  if (Number.isNaN(endMs)) return null

  const diffMs = endMs - Date.now()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export default async function DunningBanner({ salonId, slug }: DunningBannerProps) {
  try {
    const supabase = createAdminSupabaseClient()

    const { data, error } = await supabase
      .from('subscriptions')
      .select('status,next_retry_at,dunning_attempt,current_period_end')
      .eq('salon_id', salonId)
      .eq('status', 'past_due')
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const sub = data as unknown as PastDueSubscription
    const attempt = Math.min(3, Math.max(1, sub.dunning_attempt ?? 1))
    const daysLeft = getDaysLeft(sub.current_period_end)

    const details =
      daysLeft !== null
        ? `Próba ${attempt}/3. Pozostało ${daysLeft} ${daysLeft === 1 ? 'dzień' : 'dni'} do końca okresu.`
        : `Próba ${attempt}/3. Zaktualizuj metodę płatności, aby uniknąć przerwy w dostępie.`

    return (
      <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-background/50 backdrop-blur-md shadow-lg shadow-red-500/10 p-5 md:p-6 group transition-all duration-300 hover:border-red-500/50">
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-red-500/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/20 shadow-inner">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-red-500 tracking-tight">Problemy z płatnością</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{details}</p>
            </div>
          </div>

          <Link href={`/${slug}/billing`} className="self-stretch sm:self-auto">
            <Button
              variant="destructive"
              className="w-full sm:w-auto gap-2 shadow-md hover:shadow-xl transition-all duration-300 rounded-xl"
            >
              Zaktualizuj płatność
            </Button>
          </Link>
        </div>
      </div>
    )
  } catch {
    return null
  }
}
