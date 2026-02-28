import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { buildCampaignJobs, enqueueCampaign } from '@/lib/messaging/campaign-processor'
import { validateCronSecret } from '@/lib/middleware/cron-auth'

type Automation = {
  id: string
  salon_id: string
  name: string
  trigger_type: 'no_visit_days' | 'birthday' | 'after_visit' | 'visit_count'
  trigger_config: Record<string, any> | null
  channel: 'email' | 'sms' | 'both'
  template_id: string
}

const MAX_AUTOMATIONS_PER_RUN = 50
const MAX_RECIPIENTS_PER_AUTOMATION = 500
const MAX_TOTAL_JOBS_PER_RUN = 2000

function parseIntSafe(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.floor(value)
}

function birthdayDateParts(offsetDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return {
    month: date.getMonth() + 1,
    day: date.getDate(),
  }
}

async function listPotentialRecipients(admin: any, automation: Automation) {
  const cfg = automation.trigger_config || {}

  let query = admin
    .from('clients')
    .select('id, full_name, email, phone, email_opt_in, sms_opt_in, visit_count, total_spent, last_visit_at, birthday')
    .eq('salon_id', automation.salon_id)
    .is('deleted_at', null)
    .limit(MAX_RECIPIENTS_PER_AUTOMATION)

  if (automation.trigger_type === 'no_visit_days') {
    const days = parseIntSafe(cfg.days, 30)
    const cutoff = new Date(Date.now() - Math.max(0, days) * 24 * 60 * 60 * 1000).toISOString()
    query = query.not('last_visit_at', 'is', null).lte('last_visit_at', cutoff)
  }

  if (automation.trigger_type === 'after_visit') {
    const days = parseIntSafe(cfg.days, 3)
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - days)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)

    query = query
      .not('last_visit_at', 'is', null)
      .gte('last_visit_at', start.toISOString())
      .lt('last_visit_at', end.toISOString())
  }

  if (automation.trigger_type === 'visit_count') {
    const count = parseIntSafe(cfg.count, 1)
    query = query.eq('visit_count', Math.max(1, count))
  }

  if (automation.trigger_type === 'birthday') {
    const offsetDays = parseIntSafe(cfg.offsetDays, 0)
    const { month, day } = birthdayDateParts(Math.max(-31, Math.min(31, offsetDays)))
    query = query.not('birthday', 'is', null)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return (data || []).filter((row: any) => {
      if (!row.birthday) return false
      const d = new Date(row.birthday)
      return d.getMonth() + 1 === month && d.getDate() === day
    })
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

async function filterDeduplicatedRecipients(admin: any, automation: Automation, recipients: any[]) {
  const cfg = automation.trigger_config || {}
  const dedupeDays = Math.max(1, parseIntSafe(cfg.dedupeDays, 30))
  const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000).toISOString()

  const filtered: any[] = []
  for (const recipient of recipients) {
    const { count, error } = await admin
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', automation.salon_id)
      .eq('automation_id', automation.id)
      .eq('client_id', recipient.id)
      .gte('created_at', since)

    if (error) throw new Error(error.message)
    if ((count || 0) === 0) filtered.push(recipient)
  }

  return filtered
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()

  const authError = validateCronSecret(request)
  if (authError) return authError

  const admin = createAdminSupabaseClient() as any
  const results = {
    automationsScanned: 0,
    automationsProcessed: 0,
    campaignsCreated: 0,
    jobsQueued: 0,
    recipientsMatched: 0,
    recipientsSkippedByDedupe: 0,
    stoppedBySafetyLimit: false,
    errors: [] as string[],
  }

  try {
    const { data: automations, error } = await admin
      .from('crm_automations')
      .select('id, salon_id, name, trigger_type, trigger_config, channel, template_id')
      .eq('is_active', true)
      .not('template_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_AUTOMATIONS_PER_RUN)

    if (error) throw new Error(error.message)

    const activeAutomations: Automation[] = automations || []
    results.automationsScanned = activeAutomations.length

    for (const automation of activeAutomations) {
      if (results.jobsQueued >= MAX_TOTAL_JOBS_PER_RUN) {
        results.stoppedBySafetyLimit = true
        break
      }

      try {
        const matchedRecipients = await listPotentialRecipients(admin, automation)
        results.recipientsMatched += matchedRecipients.length

        const dedupedRecipients = await filterDeduplicatedRecipients(admin, automation, matchedRecipients)
        results.recipientsSkippedByDedupe += matchedRecipients.length - dedupedRecipients.length

        if (dedupedRecipients.length === 0) {
          await admin
            .from('crm_automations')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', automation.id)
            .eq('salon_id', automation.salon_id)
          results.automationsProcessed++
          continue
        }

        const { data: campaign, error: campaignError } = await admin
          .from('crm_campaigns')
          .insert({
            salon_id: automation.salon_id,
            name: `[Automation] ${automation.name} (${new Date().toISOString().slice(0, 10)})`,
            status: 'sending',
            channel: automation.channel,
            template_id: automation.template_id,
            automation_id: automation.id,
            segment_filters: {
              source: 'automation',
              automationId: automation.id,
              triggerType: automation.trigger_type,
            },
            recipient_count: 0,
            sent_count: 0,
            failed_count: 0,
            sent_at: null,
          })
          .select('id, salon_id')
          .single()

        if (campaignError || !campaign?.id) {
          throw new Error(campaignError?.message || 'Failed to create campaign context')
        }

        const jobs = buildCampaignJobs({
          salonId: automation.salon_id,
          campaignId: campaign.id,
          recipients: dedupedRecipients,
          channel: automation.channel,
        }).map((job) => ({ ...job, automationId: automation.id }))

        const remaining = Math.max(0, MAX_TOTAL_JOBS_PER_RUN - results.jobsQueued)
        const boundedJobs = jobs.slice(0, remaining)

        if (boundedJobs.length === 0) {
          await admin
            .from('crm_campaigns')
            .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: 0 })
            .eq('id', campaign.id)
            .eq('salon_id', automation.salon_id)
          await admin
            .from('crm_automations')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', automation.id)
            .eq('salon_id', automation.salon_id)
          results.automationsProcessed++
          results.stoppedBySafetyLimit = true
          break
        }

        const enqueueResult = await enqueueCampaign({
          jobs: boundedJobs,
          scheduledAt: null,
          retries: 3,
        })

        await admin
          .from('crm_campaigns')
          .update({
            status: 'sending',
            recipient_count: boundedJobs.length,
            qstash_message_id: enqueueResult.messageIds[0] || null,
          })
          .eq('id', campaign.id)
          .eq('salon_id', automation.salon_id)

        await admin
          .from('crm_automations')
          .update({ last_run_at: new Date().toISOString() })
          .eq('id', automation.id)
          .eq('salon_id', automation.salon_id)

        results.jobsQueued += boundedJobs.length
        results.campaignsCreated++
        results.automationsProcessed++
      } catch (automationError) {
        results.errors.push(
          `automation ${automation.id}: ${automationError instanceof Error ? automationError.message : 'unknown error'}`
        )
      }
    }

    return NextResponse.json({
      success: true,
      duration: Date.now() - startedAt,
      limits: {
        maxAutomationsPerRun: MAX_AUTOMATIONS_PER_RUN,
        maxRecipientsPerAutomation: MAX_RECIPIENTS_PER_AUTOMATION,
        maxTotalJobsPerRun: MAX_TOTAL_JOBS_PER_RUN,
      },
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to process CRM automations cron',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startedAt,
        results,
      },
      { status: 500 }
    )
  }
}

