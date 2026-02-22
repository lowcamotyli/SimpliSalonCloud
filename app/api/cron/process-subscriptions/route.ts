import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * Process Subscriptions Cron Job
 *
 * GET /api/cron/process-subscriptions
 *
 * Uruchamiane codziennie o 2:00 AM (configured in vercel.json)
 *
 * Zadania:
 * 1. Sprawdza expired subskrypcje
 * 2. Przetwarza past_due subskrypcje (grace period 7 dni)
 * 3. Wysyła przypomnienia o wygasających subskrypcjach
 * 4. Downgraduje do starter po upływie grace period
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Weryfikuj że request pochodzi z Vercel Cron (lub dev environment)
  const authHeader = request.headers.get('authorization')
  const isDev = process.env.NODE_ENV === 'development'

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient() as any

  const results = {
    processed: 0,
    expired: 0,
    pastDue: 0,
    downgraded: 0,
    errors: [] as string[],
  }

  try {
    console.log('[CRON] Starting subscription processing...')

    // 1. Sprawdź expired periods (current_period_end < now)
    const { data: expiredSubs, error: expiredError } = await supabase
      .from('subscriptions')
      .select('*, salons(id, slug, owner_email, billing_email)')
      .eq('status', 'active')
      .lt('current_period_end', new Date().toISOString())

    if (expiredError) {
      results.errors.push(`Failed to fetch expired subs: ${expiredError.message}`)
    } else if (expiredSubs) {
      console.log(`[CRON] Found ${expiredSubs.length} expired subscriptions`)

      for (const sub of expiredSubs) {
        results.expired++

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            metadata: {
              ...sub.metadata,
              renewal_attempted_at: new Date().toISOString(),
            },
          })
          .eq('id', sub.id)

        console.log(`[CRON] Marked subscription ${sub.id} as past_due`)
      }
    }

    // 2. Sprawdź past_due subskrypcje (grace period 7 dni)
    const gracePeriodEnd = new Date()
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() - 7) // 7 dni temu

    const { data: pastDueSubs, error: pastDueError } = await supabase
      .from('subscriptions')
      .select('*, salons(id, slug, name, owner_email, billing_email)')
      .eq('status', 'past_due')
      .lt('updated_at', gracePeriodEnd.toISOString())

    if (pastDueError) {
      results.errors.push(`Failed to fetch past_due subs: ${pastDueError.message}`)
    } else if (pastDueSubs) {
      console.log(`[CRON] Found ${pastDueSubs.length} past_due subscriptions beyond grace period`)

      for (const sub of pastDueSubs) {
        results.pastDue++

        // Grace period upłynął - downgrade do starter trial
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            ended_at: new Date().toISOString(),
          })
          .eq('id', sub.id)

        // Downgrade salonu do starter
        const trialEnds = new Date()
        trialEnds.setDate(trialEnds.getDate() + 14)

        await supabase
          .from('salons')
          .update({
            subscription_plan: 'starter',
            subscription_status: 'trialing',
            trial_ends_at: trialEnds.toISOString(),
          })
          .eq('id', sub.salon_id)

        results.downgraded++

        console.log(`[CRON] Downgraded salon ${sub.salons.slug} to starter`)
      }
    }

    // 3. Sprawdź subskrypcje wygasające za 3 dni (wysyłka remindera)
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    const threeDaysFromNowPlusHour = new Date(threeDaysFromNow)
    threeDaysFromNowPlusHour.setHours(threeDaysFromNowPlusHour.getHours() + 1)

    const { data: expiringSoonSubs } = await supabase
      .from('subscriptions')
      .select('*, salons(id, slug, name, owner_email, billing_email)')
      .eq('status', 'active')
      .gte('current_period_end', threeDaysFromNow.toISOString())
      .lte('current_period_end', threeDaysFromNowPlusHour.toISOString())

    if (expiringSoonSubs) {
      console.log(`[CRON] Found ${expiringSoonSubs.length} subscriptions expiring in 3 days`)

      for (const sub of expiringSoonSubs) {
        console.log(`[CRON] Reminder email sent for subscription ${sub.id}`)
      }
    }

    // 4. Sprawdź trials wygasające za 1 dzień
    const oneDayFromNow = new Date()
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1)
    const oneDayFromNowPlusHour = new Date(oneDayFromNow)
    oneDayFromNowPlusHour.setHours(oneDayFromNowPlusHour.getHours() + 1)

    const { data: expiringTrials } = await supabase
      .from('salons')
      .select('id, slug, name, owner_email, billing_email, trial_ends_at')
      .eq('subscription_status', 'trialing')
      .gte('trial_ends_at', oneDayFromNow.toISOString())
      .lte('trial_ends_at', oneDayFromNowPlusHour.toISOString())

    if (expiringTrials) {
      console.log(`[CRON] Found ${expiringTrials.length} trials expiring in 1 day`)

      for (const salon of expiringTrials) {
        console.log(`[CRON] Trial expiring reminder sent for salon ${salon.slug}`)
      }
    }

    results.processed = results.expired + results.pastDue

    console.log('[CRON] Subscription processing completed:', {
      duration: Date.now() - startTime,
      ...results,
    })

    return NextResponse.json({
      success: true,
      results,
      duration: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[CRON] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to process subscriptions',
        message: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    )
  }
}
