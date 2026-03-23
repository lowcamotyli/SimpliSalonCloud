import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { encryptField } from '@/lib/forms/encryption'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Enums, Json, TablesInsert } from '@/types/supabase'

type TreatmentRecordInsert = TablesInsert<'treatment_records'>
type FormDataCategory = Enums<'form_data_category'>

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
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

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError('limit must be a positive integer')
  }

  return Math.min(parsed, MAX_LIMIT)
}

function parseOffset(raw: string | null): number {
  if (!raw) return 0

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError('offset must be a non-negative integer')
  }

  return parsed
}

function parseDataCategory(value: unknown): FormDataCategory {
  if (value === undefined) return 'general'
  if (typeof value !== 'string' || !ALLOWED_DATA_CATEGORIES.includes(value as FormDataCategory)) {
    throw new ValidationError(`data_category must be one of: ${ALLOWED_DATA_CATEGORIES.join(', ')}`)
  }
  return value as FormDataCategory
}

// GET /api/treatment-records - list treatment records for salon
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const limit = parseLimit(searchParams.get('limit'))
  const offset = parseOffset(searchParams.get('offset'))

  let query = supabase
    .from('treatment_records')
    .select(`
      *,
      client:clients(id, full_name),
      employee:employees(id, first_name, last_name),
      service:services(id, name)
    `)
    .eq('salon_id', salonId)
    .order('performed_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data: records, error } = await query.range(offset, offset + limit - 1)

  if (error) throw error

  return NextResponse.json({
    records: records ?? [],
    pagination: {
      limit,
      offset,
    },
  })
})

// POST /api/treatment-records - create treatment record
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const role = await getAuthenticatedRole(supabase)
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can create treatment records')
  }

  const featureEnabled = await isTreatmentRecordsFeatureEnabled(supabase, salonId)
  if (!featureEnabled) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  const body = await request.json()

  if (!body?.client_id || typeof body.client_id !== 'string') {
    throw new ValidationError('client_id is required')
  }

  if (!body?.employee_id || typeof body.employee_id !== 'string') {
    throw new ValidationError('employee_id is required')
  }

  const insertPayload: TreatmentRecordInsert = {
    salon_id: salonId,
    client_id: body.client_id,
    employee_id: body.employee_id,
    service_id: typeof body.service_id === 'string' ? body.service_id : null,
    booking_id: typeof body.booking_id === 'string' ? body.booking_id : null,
    performed_at:
      typeof body.performed_at === 'string' && body.performed_at.trim().length > 0
        ? body.performed_at
        : new Date().toISOString(),
    parameters:
      body.parameters !== undefined && body.parameters !== null
        ? (body.parameters as Json)
        : ({} as Json),
    data_category: parseDataCategory(body.data_category),
    notes_encrypted:
      typeof body.notes === 'string' && body.notes.trim().length > 0
        ? encryptField(body.notes)
        : null,
  }

  const { data: record, error } = await supabase
    .from('treatment_records')
    .insert(insertPayload)
    .select(`
      *,
      client:clients(id, full_name),
      employee:employees(id, first_name, last_name),
      service:services(id, name)
    `)
    .single()

  if (error) throw error

  return NextResponse.json({ record }, { status: 201 })
})
