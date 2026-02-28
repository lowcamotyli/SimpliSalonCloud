import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const parsedQuery = querySchema.safeParse({ salonId: request.nextUrl.searchParams.get('salonId') })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data: campaign, error: campaignError } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, salon_id, name, status, recipient_count, sent_count, failed_count, scheduled_at, sent_at, created_at')
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (campaignError) {
      return NextResponse.json({ error: campaignError.message }, { status: 500 })
    }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const { data: grouped, error: groupedError } = await (supabase as any)
      .from('message_logs')
      .select('status')
      .eq('campaign_id', id)
      .eq('salon_id', parsedQuery.data.salonId)

    if (groupedError) {
      return NextResponse.json({ error: groupedError.message }, { status: 500 })
    }

    const byStatus = (grouped || []).reduce(
      (acc: Record<string, number>, row: { status: string }) => {
        acc[row.status] = (acc[row.status] || 0) + 1
        return acc
      },
      {}
    )

    return NextResponse.json({
      campaign,
      stats: {
        total: campaign.recipient_count || 0,
        sent: campaign.sent_count || 0,
        failed: campaign.failed_count || 0,
        pending: Math.max(0, (campaign.recipient_count || 0) - (campaign.sent_count || 0) - (campaign.failed_count || 0)),
        delivered: byStatus.delivered || 0,
        bounced: byStatus.bounced || 0,
        statusBreakdown: byStatus,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaign stats' },
      { status: 500 }
    )
  }
}

