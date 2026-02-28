import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'
import { SubscriptionManager, PlanType } from '@/lib/payments/subscription-manager'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const CRM_LIMITS_BY_PLAN: Record<PlanType, { email: number; sms: number }> = {
  starter: { email: 500, sms: 0 },
  professional: { email: 2000, sms: 200 },
  business: { email: 10000, sms: 1000 },
  enterprise: { email: Number.POSITIVE_INFINITY, sms: Number.POSITIVE_INFINITY },
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = querySchema.safeParse({ salonId: request.nextUrl.searchParams.get('salonId') })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }

    const salonId = parsed.data.salonId

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const feature = await checkFeatureAccess(salonId, 'crm_campaigns')
    if (!feature.allowed) {
      return NextResponse.json(
        { error: feature.reason || 'CRM usage is not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      )
    }

    const { data: salon, error: salonError } = await (supabase as any)
      .from('salons')
      .select('id, subscription_plan')
      .eq('id', salonId)
      .single()

    if (salonError || !salon) {
      return NextResponse.json({ error: salonError?.message || 'Salon not found' }, { status: 404 })
    }

    const planType = (salon.subscription_plan || 'starter') as PlanType
    const plan = SubscriptionManager.getPlanConfig(planType)
    const month = getCurrentMonth()

    const { data: usage } = await (supabase as any)
      .from('usage_tracking')
      .select('emails_sent_count, sms_sent_count')
      .eq('salon_id', salonId)
      .eq('period_month', month)
      .maybeSingle()

    const emailUsed = usage?.emails_sent_count || 0
    const smsUsed = usage?.sms_sent_count || 0
    const emailLimit = CRM_LIMITS_BY_PLAN[planType].email
    const smsLimit = CRM_LIMITS_BY_PLAN[planType].sms

    const emailPercentage = Number.isFinite(emailLimit) && emailLimit > 0 ? Math.min((emailUsed / emailLimit) * 100, 100) : 0
    const smsPercentage = Number.isFinite(smsLimit) && smsLimit > 0 ? Math.min((smsUsed / smsLimit) * 100, 100) : 0

    return NextResponse.json({
      plan: plan.name,
      period: month,
      usage: {
        email: {
          used: emailUsed,
          limit: emailLimit,
          percentage: emailPercentage,
        },
        sms: {
          used: smsUsed,
          limit: smsLimit,
          percentage: smsPercentage,
        },
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch CRM usage' },
      { status: 500 }
    )
  }
}

