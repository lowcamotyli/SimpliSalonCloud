import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Json, TablesInsert } from '@/types/supabase'

type TreatmentProtocolInsert = TablesInsert<'treatment_protocols'>

async function ensureTreatmentRecordsFeatureEnabled(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string
) {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('features')
    .eq('id', salonId)
    .single()

  if (error) throw error

  if (!hasFeature((salon as { features: Record<string, boolean> | null } | null)?.features, 'treatment_records')) {
    throw new ForbiddenError('Feature not available')
  }
}

async function requireAnySalonRole(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  requiredRoles: string[],
  message: string
) {
  const { data, error } = await supabase.rpc('has_any_salon_role', {
    required_roles: requiredRoles,
  })

  if (error) throw error
  if (!data) throw new ForbiddenError(message)
}

function parseBooleanParam(value: string | null): boolean {
  if (value === null) return false
  return value === 'true' || value === '1'
}

// GET /api/treatment-protocols - list treatment protocols for salon
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  await ensureTreatmentRecordsFeatureEnabled(supabase, salonId)

  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get('service_id')
  const includeAll = parseBooleanParam(searchParams.get('all'))

  let query = supabase
    .from('treatment_protocols')
    .select(`
      *,
      service:services(id, name)
    `)
    .eq('salon_id', salonId)
    .order('name', { ascending: true })
    .order('created_at', { ascending: false })

  if (serviceId) {
    query = query.eq('service_id', serviceId)
  }

  if (!includeAll) {
    query = query.eq('is_active', true)
  }

  const { data: protocols, error } = await query

  if (error) throw error

  return NextResponse.json({ protocols: protocols ?? [] })
})

// POST /api/treatment-protocols - create a treatment protocol
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  await ensureTreatmentRecordsFeatureEnabled(supabase, salonId)
  await requireAnySalonRole(
    supabase,
    ['owner', 'manager'],
    'Only owner or manager can create treatment protocols'
  )

  const body = await request.json()

  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new ValidationError('name is required')
  }

  const insertPayload: TreatmentProtocolInsert = {
    salon_id: salonId,
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description : null,
    service_id: typeof body.service_id === 'string' ? body.service_id : null,
    fields: Array.isArray(body.fields) ? (body.fields as Json) : ([] as Json),
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
  }

  const { data: protocol, error } = await supabase
    .from('treatment_protocols')
    .insert(insertPayload)
    .select(`
      *,
      service:services(id, name)
    `)
    .single()

  if (error) throw error

  return NextResponse.json({ protocol }, { status: 201 })
})
