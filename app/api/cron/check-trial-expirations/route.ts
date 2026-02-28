import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { validateCronSecret } from '@/lib/middleware/cron-auth'

/**
 * Check Trial Expirations Cron Job
 *
 * GET /api/cron/check-trial-expirations
 *
 * Uruchamiane codziennie o 10:00 AM (configured in vercel.json)
 *
 * Zadania:
 * 1. Sprawdza wygasłe trials
 * 2. Blokuje dostęp dla salonów z wygasłym trialem
 * 3. Wysyła powiadomienia
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const authError = validateCronSecret(request)
  if (authError) return authError

  const supabase = createAdminSupabaseClient()

  const results = {
    checked: 0,
    expired: 0,
    blocked: 0,
    errors: [] as string[],
  }

  try {
    console.log('[CRON] Checking trial expirations...')

    // Znajdź salony z wygasłym trialem
    const { data: expiredTrials, error } = await (supabase as any)
      .from('salons')
      .select('id, slug, name, owner_email, trial_ends_at')
      .eq('subscription_status', 'trialing')
      .lt('trial_ends_at', new Date().toISOString())

    if (error) {
      results.errors.push(`Failed to fetch expired trials: ${error.message}`)
      throw error
    }

    results.checked = expiredTrials?.length || 0

    if (expiredTrials && expiredTrials.length > 0) {
      console.log(`[CRON] Found ${expiredTrials.length} expired trials`)

      for (const salon of expiredTrials) {
        // Zablokuj dostęp - zmień status na canceled
        const { error: updateError } = await supabase
          .from('salons')
          .update({
            subscription_status: 'canceled',
          })
          .eq('id', salon.id)

        if (updateError) {
          results.errors.push(
            `Failed to block salon ${salon.slug}: ${updateError.message}`
          )
          continue
        }

        results.expired++
        results.blocked++

        console.log(`[CRON] Blocked salon ${salon.slug} - trial expired`)
      }
    }

    console.log('[CRON] Trial expiration check completed:', {
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
        error: 'Failed to check trial expirations',
        message: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    )
  }
}
