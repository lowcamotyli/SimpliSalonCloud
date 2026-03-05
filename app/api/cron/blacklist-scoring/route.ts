import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hasFeature } from '@/lib/features'
import { validateCronRequest } from '@/lib/cron/guard'

type ScoringSetting = {
  salon_id: string
  no_show_threshold: number
  late_cancel_threshold: number
  window_months: number
  salons: { features: Record<string, boolean> | null } | null
}

export async function GET(request: NextRequest) {
  const authError = validateCronRequest(request)
  if (authError) return authError

  const admin = createAdminSupabaseClient() as any
  const summary = {
    salonsScanned: 0,
    salonsProcessed: 0,
    violationsScanned: 0,
    clientsWarned: 0,
    clientsBlacklisted: 0,
  }

  try {
    const { data: settings, error: settingsError } = await admin
      .from('blacklist_settings')
      .select('salon_id, no_show_threshold, late_cancel_threshold, window_months, salons!inner(features)')

    if (settingsError) throw settingsError

    const rows = (settings || []) as ScoringSetting[]
    summary.salonsScanned = rows.length

    for (const setting of rows) {
      if (!hasFeature(setting.salons?.features, 'blacklist')) {
        continue
      }

      const windowStart = new Date()
      windowStart.setMonth(windowStart.getMonth() - setting.window_months)

      const { data: salonClients, error: clientsError } = await admin
        .from('clients')
        .select('id')
        .eq('salon_id', setting.salon_id)
        .is('deleted_at', null)

      if (clientsError) throw clientsError

      const clientIds = (salonClients || []).map((c: any) => c.id)
      if (clientIds.length === 0) {
        summary.salonsProcessed++
        continue
      }

      const { data: violations, error: violationsError } = await admin
        .from('client_violations')
        .select('client_id, violation_type')
        .in('violation_type', ['no_show', 'late_cancel'])
        .gte('occurred_at', windowStart.toISOString())
        .in('client_id', clientIds)

      if (violationsError) throw violationsError

      const noShowCounts: Record<string, number> = {}
      const lateCancelCounts: Record<string, number> = {}
      for (const row of violations || []) {
        if (row.violation_type === 'no_show') {
          noShowCounts[row.client_id] = (noShowCounts[row.client_id] ?? 0) + 1
        } else if (row.violation_type === 'late_cancel') {
          lateCancelCounts[row.client_id] = (lateCancelCounts[row.client_id] ?? 0) + 1
        }
      }

      summary.violationsScanned += (violations || []).length

      const violationClientIds = new Set<string>([
        ...Object.keys(noShowCounts),
        ...Object.keys(lateCancelCounts),
      ])

      for (const clientId of violationClientIds) {
        const noShows = noShowCounts[clientId] ?? 0
        const lateCancels = lateCancelCounts[clientId] ?? 0
        const shouldBlacklist =
          noShows >= setting.no_show_threshold ||
          lateCancels >= setting.late_cancel_threshold

        if (shouldBlacklist) {
          const { data: blacklistedRows, error } = await admin
            .from('clients')
            .update({
              blacklist_status: 'blacklisted',
              no_show_count: noShows,
              blacklisted_at: new Date().toISOString(),
              blacklist_reason: `Automatyczna blokada: ${noShows} nieodwolanych wizyt i ${lateCancels} poznych anulacji w ciagu ${setting.window_months} mies.`,
            })
            .eq('id', clientId)
            .in('blacklist_status', ['clean', 'warned'])
            .select('id')

          if (error) throw error
          if ((blacklistedRows || []).length > 0) {
            summary.clientsBlacklisted++
          }
          continue
        }

        const nearThreshold =
          (setting.no_show_threshold > 1 && noShows === setting.no_show_threshold - 1) ||
          (setting.late_cancel_threshold > 1 && lateCancels === setting.late_cancel_threshold - 1)

        if (nearThreshold) {
          const { data: warnedRows, error } = await admin
            .from('clients')
            .update({
              blacklist_status: 'warned',
              no_show_count: noShows,
            })
            .eq('id', clientId)
            .eq('blacklist_status', 'clean')
            .select('id')

          if (error) throw error
          if ((warnedRows || []).length > 0) {
            summary.clientsWarned++
          }
        }
      }

      summary.salonsProcessed++
    }

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to score blacklist status',
        message: error instanceof Error ? error.message : 'Unknown error',
        summary,
      },
      { status: 500 }
    )
  }
}
