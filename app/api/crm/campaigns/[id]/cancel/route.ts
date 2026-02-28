import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const cancelSchema = z.object({
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

    const payload = cancelSchema.parse(await request.json())
    const auth = await authorize(supabase as any, payload.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data: campaign, error: campaignError } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, status, salon_id')
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (campaignError) {
      return NextResponse.json({ error: campaignError.message }, { status: 500 })
    }

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled campaigns can be cancelled' }, { status: 409 })
    }

    const { data, error } = await (supabase as any)
      .from('crm_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .select('id, status, scheduled_at, updated_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, campaign: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel campaign' },
      { status: 500 }
    )
  }
}

