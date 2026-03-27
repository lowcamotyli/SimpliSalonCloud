import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { TablesInsert } from '@/types/supabase'

type TreatmentPlanInsert = TablesInsert<'treatment_plans'>
type TreatmentSessionInsert = TablesInsert<'treatment_sessions'>

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

function parsePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${fieldName} must be a positive integer`)
  }

  return value
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string or null`)
  }

  return value
}

function parseRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required`)
  }

  return value.trim()
}

// GET /api/treatment-plans - list treatment plans for salon
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can access treatment plans')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('treatment_plans')
    .select('*')
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data: plans, error } = await query

  if (error) throw error

  const planIds = (plans ?? []).map((plan) => plan.id)
  let totalSessionCounts = new Map<string, number>()
  let completedSessionCounts = new Map<string, number>()

  if (planIds.length > 0) {
    const { data: sessions, error: sessionsError } = await supabase
      .from('treatment_sessions')
      .select('plan_id, status')
      .eq('salon_id', salonId)
      .in('plan_id', planIds)

    if (sessionsError) throw sessionsError

    for (const session of sessions ?? []) {
      totalSessionCounts.set(
        session.plan_id,
        (totalSessionCounts.get(session.plan_id) ?? 0) + 1
      )

      if (session.status === 'completed') {
        completedSessionCounts.set(
          session.plan_id,
          (completedSessionCounts.get(session.plan_id) ?? 0) + 1
        )
      }
    }
  }

  return NextResponse.json({
    plans: (plans ?? []).map((plan) => ({
      ...plan,
      completed_sessions: completedSessionCounts.get(plan.id) ?? 0,
      total_sessions: totalSessionCounts.get(plan.id) ?? 0,
      session_count: completedSessionCounts.get(plan.id) ?? 0,
    })),
  })
})

// POST /api/treatment-plans - create treatment plan and empty sessions
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can create treatment plans')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const body = await request.json()

  const totalSessions = parsePositiveInteger(body?.total_sessions, 'total_sessions')

  const insertPayload: TreatmentPlanInsert = {
    salon_id: salonId,
    client_id: parseRequiredString(body?.client_id, 'client_id'),
    name: parseRequiredString(body?.name, 'name'),
    total_sessions: totalSessions,
    notes: parseOptionalString(body?.notes, 'notes') ?? null,
    protocol_id:
      body?.protocol_id === undefined
        ? null
        : parseOptionalString(body.protocol_id, 'protocol_id'),
    service_id:
      body?.service_id === undefined
        ? null
        : parseOptionalString(body.service_id, 'service_id'),
    status:
      body?.status === undefined
        ? 'active'
        : parseRequiredString(body.status, 'status'),
    started_at:
      body?.started_at === undefined
        ? null
        : parseOptionalString(body.started_at, 'started_at'),
    completed_at:
      body?.completed_at === undefined
        ? null
        : parseOptionalString(body.completed_at, 'completed_at'),
  }

  const { data: plan, error: planError } = await supabase
    .from('treatment_plans')
    .insert(insertPayload)
    .select('*')
    .single()

  if (planError) throw planError

  const sessionPayload: TreatmentSessionInsert[] = Array.from(
    { length: totalSessions },
    (_, index) => ({
      salon_id: salonId,
      plan_id: plan.id,
      session_number: index + 1,
      status: 'planned',
      booking_id: null,
      treatment_record_id: null,
      scheduled_at: null,
      completed_at: null,
      notes: null,
    })
  )

  const { error: sessionsError } = await supabase
    .from('treatment_sessions')
    .insert(sessionPayload)

  if (sessionsError) throw sessionsError

  return NextResponse.json(
    {
      plan: {
        ...plan,
        session_count: totalSessions,
      },
    },
    { status: 201 }
  )
})
