import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

async function isTreatmentRecordsFeatureEnabled(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string
) {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('features')
    .eq('id', salonId)
    .single()

  if (error) throw error

  return hasFeature(
    (salon as { features: Record<string, boolean> | null } | null)?.features,
    'treatment_records'
  )
}

// GET /api/treatment-plans/[id]/sessions - list sessions for plan
export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { data: plan, error: planError } = await supabase
    .from('treatment_plans')
    .select('id')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (planError) {
    if (planError.code === 'PGRST116') throw new NotFoundError('TreatmentPlan', id)
    throw planError
  }

  if (!plan) {
    throw new NotFoundError('TreatmentPlan', id)
  }

  const { data: sessions, error } = await supabase
    .from('treatment_sessions')
    .select('*')
    .eq('plan_id', id)
    .eq('salon_id', salonId)
    .order('session_number', { ascending: true })

  if (error) throw error

  return NextResponse.json({ sessions: sessions ?? [] })
})
