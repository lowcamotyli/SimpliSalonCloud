import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext, type AuthContext } from '@/lib/supabase/get-auth-context'
import type { Tables, TablesInsert } from '@/types/supabase'

type ServiceAddon = Tables<'service_addons'>

async function ensureServiceBelongsToSalon(
  supabase: AuthContext['supabase'],
  serviceId: string,
  salonId: string
) {
  const { data: service, error } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .single()

  if (error || !service) {
    throw new NotFoundError('Service', serviceId)
  }
}

function parseNumberField(value: unknown, fieldName: string) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} must be a valid number`)
  }

  return parsed
}

function parseIntegerField(value: unknown, fieldName: string) {
  const parsed = parseNumberField(value, fieldName)

  if (!Number.isInteger(parsed)) {
    throw new ValidationError(`${fieldName} must be an integer`)
  }

  return parsed
}

// GET /api/services/[id]/addons - list active add-ons for a service
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureServiceBelongsToSalon(supabase, id, salonId)

  const { data: addons, error } = await supabase
    .from('service_addons')
    .select('*')
    .eq('salon_id', salonId)
    .eq('service_id', id)
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return NextResponse.json({ addons: (addons ?? []) as ServiceAddon[] })
})

// POST /api/services/[id]/addons - create a new add-on for a service
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureServiceBelongsToSalon(supabase, id, salonId)

  const body = await request.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!name) {
    throw new ValidationError('name is required')
  }

  const addonPayload: TablesInsert<'service_addons'> = {
    salon_id: salonId,
    service_id: id,
    name,
    price_delta: parseNumberField(body?.price_delta, 'price_delta'),
    duration_delta: parseIntegerField(body?.duration_delta, 'duration_delta'),
    is_active: true,
  }

  const { data: addon, error } = await supabase
    .from('service_addons')
    .insert(addonPayload)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json({ addon }, { status: 201 })
})

// DELETE /api/services/[id]/addons?addonId=... - soft-delete an add-on
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()
  const addonId = new URL(request.url).searchParams.get('addonId')

  if (!addonId) {
    throw new ValidationError('addonId query parameter is required')
  }

  await ensureServiceBelongsToSalon(supabase, id, salonId)

  const { data: existingAddon, error: existingAddonError } = await supabase
    .from('service_addons')
    .select('id')
    .eq('id', addonId)
    .eq('service_id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingAddonError || !existingAddon) {
    throw new NotFoundError('Service addon', addonId)
  }

  const { error } = await supabase
    .from('service_addons')
    .update({ is_active: false })
    .eq('id', addonId)
    .eq('service_id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return NextResponse.json({ success: true })
})
