import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { countSegmentRecipients, listSegmentRecipients } from '@/lib/messaging/campaign-processor'

const previewSchema = z.object({
  salonId: z.string().uuid(),
  filters: z.record(z.any()).optional().default({}),
  sampleSize: z.number().int().min(0).max(20).optional().default(5),
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = previewSchema.parse(await request.json())
    const auth = await authorize(supabase as any, payload.salonId, user.id)
    if (!auth.ok) return auth.response

    const [count, sampleRaw] = await Promise.all([
      countSegmentRecipients(payload.salonId, payload.filters),
      payload.sampleSize > 0 ? listSegmentRecipients(payload.salonId, payload.filters, payload.sampleSize) : Promise.resolve([]),
    ])

    const sample = (sampleRaw || []).map((row: any) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      visitCount: row.visit_count,
      totalSpent: row.total_spent,
      lastVisitAt: row.last_visit_at,
      emailOptIn: row.email_opt_in,
      smsOptIn: row.sms_opt_in,
    }))

    return NextResponse.json({
      count,
      sample,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview segment' },
      { status: 500 }
    )
  }
}

