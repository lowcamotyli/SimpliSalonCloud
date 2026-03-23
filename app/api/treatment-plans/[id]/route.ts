import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { TablesUpdate } from '@/types/supabase'

type TreatmentPlanUpdate = TablesUpdate<'treatment_plans'>

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

async function getAuthenticatedRole(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  return user?.app_metadata?.role as string | undefined
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string or null`)
  }

  return value
}

// GET /api/treatment-plans/[id] - get treatment plan with sessions
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

  const { data: plan, error } = await supabase
    .from('treatment_plans')
    .select('*')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentPlan', id)
    throw error
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('treatment_sessions')
    .select('*')
    .eq('plan_id', id)
    .eq('salon_id', salonId)
    .order('session_number', { ascending: true })

  if (sessionsError) throw sessionsError

  return NextResponse.json({
    plan: {
      ...plan,
      sessions: sessions ?? [],
    },
  })
})

// PATCH /api/treatment-plans/[id] - update treatment plan
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can update treatment plans')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const body = await request.json()
  const updatePayload: TreatmentPlanUpdate = {}

  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name must be a non-empty string')
    }
    updatePayload.name = body.name.trim()
  }

  if (body?.status !== undefined) {
    if (typeof body.status !== 'string' || body.status.trim().length === 0) {
      throw new ValidationError('status must be a non-empty string')
    }
    updatePayload.status = body.status.trim()
  }

  if (body?.notes !== undefined) {
    updatePayload.notes = parseOptionalString(body.notes, 'notes')
  }

  if (body?.started_at !== undefined) {
    updatePayload.started_at = parseOptionalString(body.started_at, 'started_at')
  }

  if (body?.completed_at !== undefined) {
    updatePayload.completed_at = parseOptionalString(body.completed_at, 'completed_at')
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No valid fields to update')
  }

  const { data: plan, error } = await supabase
    .from('treatment_plans')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentPlan', id)
    throw error
  }

  return NextResponse.json({ plan })
})

// DELETE /api/treatment-plans/[id] - delete treatment plan
export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner') {
    throw new ForbiddenError('Only owner can delete treatment plans')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { data: existingPlan, error: existingError } = await supabase
    .from('treatment_plans')
    .select('id')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError) {
    if (existingError.code === 'PGRST116') throw new NotFoundError('TreatmentPlan', id)
    throw existingError
  }

  if (!existingPlan) {
    throw new NotFoundError('TreatmentPlan', id)
  }

  const { error } = await supabase
    .from('treatment_plans')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return new NextResponse(null, { status: 204 })
})
