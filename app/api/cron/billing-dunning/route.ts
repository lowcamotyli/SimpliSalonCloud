import { NextRequest, NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/middleware/cron-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createPrzelewy24Client } from '@/lib/payments/przelewy24-client'

export async function POST(request: NextRequest) {
  const authError = validateCronSecret(request)
  if (authError) return authError

  const supabase = createAdminSupabaseClient() as any
  const nowIso = new Date().toISOString()

  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('id, salon_id, dunning_attempt, p24_token, amount_cents, plan_type')
    .eq('status', 'past_due')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)

  if (error) {
    console.error('[CRON][DUNNING] Failed to fetch subscriptions:', error)
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
  }

  if (!subscriptions?.length) {
    return NextResponse.json({ processed: 0 })
  }

  const appUrl = process.env.APP_URL || ''
  const p24 = createPrzelewy24Client()

  let processed = 0

  for (const sub of subscriptions) {
    if ((sub.dunning_attempt ?? 0) >= 3) {
      const { error: cancelError } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('id', sub.id)

      if (cancelError) {
        console.error(`[CRON][DUNNING] Failed to cancel subscription ${sub.id}:`, cancelError)
      } else {
        console.log(`[CRON][DUNNING] Subscription ${sub.id} canceled after 3 dunning attempts`)
      }

      processed++
      continue
    }

    const nextRetryAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    if (sub.p24_token) {
      try {
        const { data: salon, error: salonError } = await supabase
          .from('salons')
          .select('owner_email')
          .eq('id', sub.salon_id)
          .single()

        if (salonError || !salon?.owner_email) {
          throw new Error(salonError?.message || 'Missing salon owner_email')
        }

        if (!appUrl) {
          throw new Error('APP_URL is not configured')
        }

        await p24.createTransaction({
          sessionId: `dunning_${sub.id}_${Date.now()}`,
          amount: sub.amount_cents,
          email: salon.owner_email,
          description: 'Odnowienie subskrypcji',
          returnUrl: `${appUrl}/billing`,
          statusUrl: `${appUrl}/api/billing/webhook`,
        })

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            dunning_attempt: (sub.dunning_attempt ?? 0) + 1,
            next_retry_at: nextRetryAt,
          })
          .eq('id', sub.id)

        if (updateError) {
          console.error(`[CRON][DUNNING] Failed to update subscription ${sub.id} after P24 transaction:`, updateError)
        }
      } catch (txError) {
        console.error(`[CRON][DUNNING] P24 transaction failed for subscription ${sub.id}:`, txError)

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            dunning_attempt: (sub.dunning_attempt ?? 0) + 1,
            next_retry_at: nextRetryAt,
          })
          .eq('id', sub.id)

        if (updateError) {
          console.error(`[CRON][DUNNING] Failed to update subscription ${sub.id} after P24 error:`, updateError)
        }
      }
    } else {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          dunning_attempt: (sub.dunning_attempt ?? 0) + 1,
          next_retry_at: nextRetryAt,
        })
        .eq('id', sub.id)

      if (updateError) {
        console.error(`[CRON][DUNNING] Failed to update subscription ${sub.id} without token:`, updateError)
      }
    }

    processed++
  }

  return NextResponse.json({ processed })
}
