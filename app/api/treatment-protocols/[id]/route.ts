import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Json, TablesUpdate } from '@/types/supabase'

type TreatmentProtocolUpdate = TablesUpdate<'treatment_protocols'>

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

async function requireSalonRole(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  requiredRole: string,
  message: string
) {
  const { data, error } = await supabase.rpc('has_salon_role', {
    required_role: requiredRole,
  })

  if (error) throw error
  if (!data) throw new ForbiddenError(message)
}

// GET /api/treatment-protocols/[id] - get single treatment protocol
export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureTreatmentRecordsFeatureEnabled(supabase, salonId)

  const { data: protocol, error } = await supabase
    .from('treatment_protocols')
    .select(`
      *,
      service:services(id, name)
    `)
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentProtocol', id)
    throw error
  }

  return NextResponse.json({ protocol })
})

// PATCH /api/treatment-protocols/[id] - update treatment protocol in place, bump version
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureTreatmentRecordsFeatureEnabled(supabase, salonId)
  await requireAnySalonRole(
    supabase,
    ['owner', 'manager'],
    'Only owner or manager can update treatment protocols'
  )

  const { data: existing, error: existingError } = await supabase
    .from('treatment_protocols')
    .select('id, version')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError) {
    if (existingError.code === 'PGRST116') throw new NotFoundError('TreatmentProtocol', id)
    throw existingError
  }

  const body = await request.json()
  const updatePayload: TreatmentProtocolUpdate = {
    version: existing.version + 1,
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name must be a non-empty string')
    }
    updatePayload.name = body.name.trim()
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw new ValidationError('description must be a string or null')
    }
    updatePayload.description = body.description
  }

  if (body.service_id !== undefined) {
    if (body.service_id !== null && typeof body.service_id !== 'string') {
      throw new ValidationError('service_id must be a string or null')
    }
    updatePayload.service_id = body.service_id
  }

  if (body.fields !== undefined) {
    if (!Array.isArray(body.fields)) {
      throw new ValidationError('fields must be an array')
    }
    updatePayload.fields = body.fields as Json
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean')
    }
    updatePayload.is_active = body.is_active
  }

  const { data: protocol, error } = await supabase
    .from('treatment_protocols')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select(`
      *,
      service:services(id, name)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentProtocol', id)
    throw error
  }

  return NextResponse.json({ protocol })
})

// DELETE /api/treatment-protocols/[id] - soft delete treatment protocol
export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureTreatmentRecordsFeatureEnabled(supabase, salonId)
  await requireSalonRole(supabase, 'owner', 'Only owner can delete treatment protocols')

  const { data: protocol, error } = await supabase
    .from('treatment_protocols')
    .update({ is_active: false })
    .eq('id', id)
    .eq('salon_id', salonId)
    .select(`
      *,
      service:services(id, name)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentProtocol', id)
    throw error
  }

  return NextResponse.json({ protocol })
})
