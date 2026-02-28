import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import {
  buildCampaignJobs,
  checkPlanLimits,
  enqueueCampaign,
  listSegmentRecipients,
} from '@/lib/messaging/campaign-processor'

const sendSchema = z.object({
  salonId: z.string().uuid(),
  mode: z.enum(['now', 'scheduled']).default('now'),
  scheduledAt: z.string().datetime().optional().nullable(),
})

async function authorize(supabase: any, salonId: string, userId: string) {
  const { data: membership, error: membershipError } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (membershipError) {
    return { ok: false as const, response: NextResponse.json({ error: membershipError.message }, { status: 500 }) }
  }

  if (!membership) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const feature = await checkFeatureAccess(salonId, 'crm_campaigns')
  if (!feature.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: feature.reason || 'CRM campaigns are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = sendSchema.parse(await request.json())
    const auth = await authorize(supabase as any, payload.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data: campaign, error: campaignError } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, salon_id, status, channel, segment_filters, scheduled_at')
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json({ error: 'Campaign cannot be enqueued in current status' }, { status: 409 })
    }

    const recipients = await listSegmentRecipients(payload.salonId, campaign.segment_filters)
    const jobs = buildCampaignJobs({
      salonId: payload.salonId,
      campaignId: campaign.id,
      recipients,
      channel: campaign.channel,
    })

    const uniqueRecipientCount = new Set(jobs.map((job) => job.clientId)).size

    const emailCount = jobs.filter((j) => j.channel === 'email').length
    const smsCount = jobs.filter((j) => j.channel === 'sms').length

    const [emailLimit, smsLimit] = await Promise.all([
      checkPlanLimits(payload.salonId, 'email', emailCount),
      checkPlanLimits(payload.salonId, 'sms', smsCount),
    ])

    if (!emailLimit.allowed) {
      return NextResponse.json({ error: emailLimit.reason, upgradeUrl: emailLimit.upgradeUrl }, { status: 402 })
    }

    if (!smsLimit.allowed) {
      return NextResponse.json({ error: smsLimit.reason, upgradeUrl: smsLimit.upgradeUrl }, { status: 402 })
    }

    const effectiveScheduledAt =
      payload.mode === 'scheduled'
        ? payload.scheduledAt || campaign.scheduled_at || null
        : null

    const queueResult = await enqueueCampaign({
      jobs,
      scheduledAt: effectiveScheduledAt,
      retries: 3,
    })

    const nextStatus = effectiveScheduledAt ? 'scheduled' : 'sending'
    const firstMessageId = queueResult.messageIds[0] || null

    const { data: updated, error: updateError } = await (supabase as any)
      .from('crm_campaigns')
      .update({
        status: nextStatus,
        scheduled_at: effectiveScheduledAt,
        recipient_count: uniqueRecipientCount,
        qstash_message_id: firstMessageId,
      })
      .eq('id', campaign.id)
      .eq('salon_id', payload.salonId)
      .select('id, status, scheduled_at, recipient_count, qstash_message_id')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      campaign: updated,
      queuedJobs: jobs.length,
      emailJobs: emailCount,
      smsJobs: smsCount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send campaign' },
      { status: 500 }
    )
  }
}

