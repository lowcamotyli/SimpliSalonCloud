import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { decryptField, encryptField } from '@/lib/forms/encryption'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Enums, Json, TablesUpdate } from '@/types/supabase'

type TreatmentRecordUpdate = TablesUpdate<'treatment_records'>
type FormDataCategory = Enums<'form_data_category'>

const ALLOWED_DATA_CATEGORIES: FormDataCategory[] = ['general', 'health', 'sensitive_health']

async function isTreatmentRecordsFeatureEnabled(supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'], salonId: string) {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('features')
    .eq('id', salonId)
    .single()

  if (error) throw error

  return hasFeature((salon as { features: Record<string, boolean> | null } | null)?.features, 'treatment_records')
}

async function getAuthenticatedRole(supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error

  return user?.app_metadata?.role as string | undefined
}

function parseDataCategory(value: unknown): FormDataCategory {
  if (typeof value !== 'string' || !ALLOWED_DATA_CATEGORIES.includes(value as FormDataCategory)) {
    throw new ValidationError(`data_category must be one of: ${ALLOWED_DATA_CATEGORIES.join(', ')}`)
  }
  return value as FormDataCategory
}

// GET /api/treatment-records/[id] - get single treatment record
export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId, user } = await getAuthContext()

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { data: record, error } = await supabase
    .from('treatment_records')
    .select(`
      *,
      client:clients(id, full_name),
      employee:employees(id, first_name, last_name),
      service:services(id, name)
    `)
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentRecord', id)
    throw error
  }

  const role = await getAuthenticatedRole(supabase)
  const dataCategory = record.data_category as 'health' | 'sensitive_health' | 'general'
  const notes = record.notes_encrypted
    ? decryptField(
        record.notes_encrypted,
        dataCategory !== 'general'
          ? {
              salonId,
              userId: user.id,
              role: role ?? 'employee',
              resourceType: 'treatment_record',
              resourceId: id,
              clientId: record.client_id ?? undefined,
              dataCategory: dataCategory as 'health' | 'sensitive_health',
            }
          : undefined
      )
    : null
  const { notes_encrypted: _omit, ...recordWithoutEncrypted } = record

  // Check health consent for photo documentation gate
  const { data: consentForm } = await supabase
    .from('client_forms')
    .select('health_consent_at')
    .eq('client_id', record.client_id)
    .eq('salon_id', salonId)
    .not('health_consent_at', 'is', null)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ record: { ...recordWithoutEncrypted, notes, has_health_consent: consentForm !== null } })
})

// PATCH /api/treatment-records/[id] - update allowed treatment record fields
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId, user } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can update treatment records')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const body = await request.json()
  const updatePayload: TreatmentRecordUpdate = {}

  if (body.parameters !== undefined) {
    updatePayload.parameters = body.parameters as Json
  }

  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      throw new ValidationError('notes must be a string or null')
    }
    updatePayload.notes_encrypted =
      typeof body.notes === 'string' && body.notes.trim().length > 0
        ? encryptField(body.notes)
        : null
  }

  if (body.data_category !== undefined) {
    updatePayload.data_category = parseDataCategory(body.data_category)
  }

  if (body.performed_at !== undefined) {
    if (typeof body.performed_at !== 'string' || body.performed_at.trim().length === 0) {
      throw new ValidationError('performed_at must be a non-empty string')
    }
    updatePayload.performed_at = body.performed_at
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No valid fields to update')
  }

  const { data: record, error } = await supabase
    .from('treatment_records')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select(`
      *,
      client:clients(id, full_name),
      employee:employees(id, first_name, last_name),
      service:services(id, name)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TreatmentRecord', id)
    throw error
  }

  const recordDataCategory = record.data_category as 'general' | 'health' | 'sensitive_health'
  const notes = record.notes_encrypted
    ? decryptField(
        record.notes_encrypted,
        recordDataCategory !== 'general'
          ? {
              salonId,
              userId: user.id,
              role: role ?? 'employee',
              resourceType: 'treatment_record',
              resourceId: id,
              clientId: record.client_id ?? undefined,
              dataCategory: recordDataCategory,
            }
          : undefined
      )
    : null
  const { notes_encrypted: _omit2, ...recordWithoutEncrypted } = record

  return NextResponse.json({ record: { ...recordWithoutEncrypted, notes } })
})

// DELETE /api/treatment-records/[id] - hard delete treatment record
export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner') {
    throw new ForbiddenError('Only owner can delete treatment records')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { error } = await supabase
    .from('treatment_records')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return new NextResponse(null, { status: 204 })
})
