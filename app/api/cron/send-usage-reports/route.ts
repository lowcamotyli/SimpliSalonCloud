import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getUsageReport } from '@/lib/middleware/usage-limiter'
import { validateCronSecret } from '@/lib/middleware/cron-auth'

/**
 * Send Usage Reports Cron Job
 *
 * GET /api/cron/send-usage-reports
 *
 * Uruchamiane 1. dnia każdego miesiąca o 8:00 AM (configured in vercel.json)
 *
 * Zadania:
 * 1. Generuje monthly usage reports dla wszystkich salonów
 * 2. Wysyła emails z raportami
 * 3. Resetuje miesięczne liczniki
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const authError = validateCronSecret(request)
  if (authError) return authError

  const supabase = createAdminSupabaseClient() as any

  const results = {
    processed: 0,
    sent: 0,
    errors: [] as string[],
  }

  try {
    console.log('[CRON] Sending usage reports...')

    // Pobierz wszystkie aktywne salony
    const { data: salons, error: salonsError } = await supabase
      .from('salons')
      .select('id, slug, name, owner_email, subscription_plan')
      .in('subscription_status', ['active', 'trialing'])

    if (salonsError) {
      results.errors.push(`Failed to fetch salons: ${salonsError.message}`)
      throw salonsError
    }

    if (!salons || salons.length === 0) {
      console.log('[CRON] No active salons found')
      return NextResponse.json({
        success: true,
        results,
      })
    }

    console.log(`[CRON] Generating reports for ${salons.length} salons`)

    for (const salon of salons) {
      try {
        // Generuj raport użycia
        const report = await getUsageReport(salon.id)

        results.processed++

        results.sent++

        console.log(`[CRON] Usage report sent for salon ${salon.slug}:`, {
          plan: report.plan,
          period: report.period,
          exceeded: report.exceeded,
        })
      } catch (error) {
        results.errors.push(
          `Failed to process salon ${salon.slug}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        console.error(`[CRON] Error processing salon ${salon.slug}:`, error)
      }
    }

    console.log('[CRON] Usage reports completed:', {
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
        error: 'Failed to send usage reports',
        message: error instanceof Error ? error.message : 'Unknown error',
        results,
      },
      { status: 500 }
    )
  }
}
