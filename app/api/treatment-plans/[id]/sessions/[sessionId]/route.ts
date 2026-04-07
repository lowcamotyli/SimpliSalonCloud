import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { TablesUpdate } from '@/types/supabase'

type TreatmentSessionUpdate = TablesUpdate<'treatment_sessions'>

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

// GET /api/treatment-plans/[id]/sessions/[sessionId] - get single session
export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) => {
  const { id, sessionId } = await params
  const { supabase, salonId } = await getAuthContext()

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { data: session, error } = await supabase
    .from('treatment_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('plan_id', id)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentSession', sessionId)
    throw error
  }

  return NextResponse.json({ session })
})

// PATCH /api/treatment-plans/[id]/sessions/[sessionId] - update session
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) => {
  const { id, sessionId } = await params
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can update treatment sessions')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { data: existingSession, error: existingError } = await supabase
    .from('treatment_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('plan_id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError) {
    if (existingError.code === 'PGRST116') throw new NotFoundError('TreatmentSession', sessionId)
    throw existingError
  }

  const body = await request.json()
  const updatePayload: TreatmentSessionUpdate = {}
  let planStatusChanged = false
  let newPlanStatus: string | null = null

  if (body?.status !== undefined) {
    if (typeof body.status !== 'string' || !['completed', 'cancelled'].includes(body.status)) {
      throw new ValidationError('status must be either completed or cancelled')
    }

    if (existingSession.status !== 'planned' && body.status !== existingSession.status) {
      throw new ValidationError('Only planned sessions can change status')
    }

    updatePayload.status = body.status
  }

  if (body?.booking_id !== undefined) {
    updatePayload.booking_id = parseOptionalString(body.booking_id, 'booking_id')

    if (updatePayload.booking_id !== null) {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', updatePayload.booking_id)
        .eq('salon_id', salonId)
        .maybeSingle()

      if (bookingError) throw bookingError
      if (!booking) {
        throw new ValidationError('booking_id must reference a booking in the same salon')
      }
    }
  }

  if (body?.treatment_record_id !== undefined) {
    updatePayload.treatment_record_id = parseOptionalString(
      body.treatment_record_id,
      'treatment_record_id'
    )
  }

  if (body?.scheduled_at !== undefined) {
    updatePayload.scheduled_at = parseOptionalString(body.scheduled_at, 'scheduled_at')
  }

  if (body?.completed_at !== undefined) {
    updatePayload.completed_at = parseOptionalString(body.completed_at, 'completed_at')
  }

  if (body?.notes !== undefined) {
    updatePayload.notes = parseOptionalString(body.notes, 'notes')
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No valid fields to update')
  }

  const { data: session, error } = await supabase
    .from('treatment_sessions')
    .update(updatePayload)
    .eq('id', sessionId)
    .eq('plan_id', id)
    .eq('salon_id', salonId)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentSession', sessionId)
    throw error
  }

  const { data: plan, error: planError } = await supabase
    .from('treatment_plans')
    .select('id, status')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (planError) {
    if (planError.code === 'PGRST116') throw new NotFoundError('TreatmentPlan', id)
    throw planError
  }

  if (session.status === 'completed' && plan.status === 'planned') {
    const { error: activatePlanError } = await supabase
      .from('treatment_plans')
      .update({ status: 'active' })
      .eq('id', id)
      .eq('salon_id', salonId)

    if (activatePlanError) throw activatePlanError

    planStatusChanged = true
    newPlanStatus = 'active'
  }

  const { data: allSessions, error: allSessionsError } = await supabase
    .from('treatment_sessions')
    .select('status')
    .eq('plan_id', id)
    .eq('salon_id', salonId)

  if (allSessionsError) throw allSessionsError

  const allSessionsClosed = (allSessions ?? []).every((item) =>
    ['completed', 'cancelled'].includes(item.status)
  )

  if (allSessionsClosed) {
    const { data: completedPlan, error: completePlanError } = await supabase
      .from('treatment_plans')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('salon_id', salonId)
      .neq('status', 'completed')
      .select('status')
      .maybeSingle()

    if (completePlanError) throw completePlanError

    if (completedPlan) {
      planStatusChanged = true
      newPlanStatus = 'completed'
    }
  }

  return NextResponse.json({
    session,
    planStatusChanged,
    newPlanStatus: newPlanStatus ?? plan.status,
  })
})
