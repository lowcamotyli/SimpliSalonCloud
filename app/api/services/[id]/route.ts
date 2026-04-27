import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { updateServiceSchema } from '@/lib/validators/service.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'

const VALID_PRICE_TYPES = ['fixed', 'variable', 'from', 'hidden', 'free'] as const

// GET /api/services/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase } = await getAuthContext()

  const { data: service, error } = await supabase
    .from('services')
    .select('*, price_type')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Service', id)
    throw error
  }

  if (!service) {
    throw new NotFoundError('Service', id)
  }

  return NextResponse.json({ service })
})

// PATCH /api/services/[id] - Update service
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  // Verify service belongs to salon and get current version
  const { data: existingService, error: existingError } = await supabase
    .from('services')
    .select('id, version')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError || !existingService) {
    throw new NotFoundError('Service', id)
  }

  const body = await request.json()
  const data = updateServiceSchema.parse(body)
  const priceType = body.price_type

  if (priceType !== undefined && !VALID_PRICE_TYPES.includes(priceType)) {
    throw new ValidationError('Invalid price_type')
  }

  const { data: service, error } = await supabase
    .from('services')
    .update({
      version: existingService.version, // Required by check_version() trigger
      ...(data.category !== undefined && { category: data.category }),
      ...(data.subcategory !== undefined && { subcategory: data.subcategory }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.duration !== undefined && { duration: data.duration }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.surcharge_allowed !== undefined && { surcharge_allowed: data.surcharge_allowed }),
      ...(data.survey_enabled !== undefined && { survey_enabled: data.survey_enabled }),
      ...(data.survey_custom_message !== undefined && { survey_custom_message: data.survey_custom_message }),
      ...(data.description !== undefined && { description: data.description }),
      ...(priceType !== undefined && { price_type: priceType }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ service })
})

// DELETE /api/services/[id] - Delete service
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  // Verify service belongs to salon
  const { data: existingService, error: existingError } = await supabase
    .from('services')
    .select('id')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError || !existingService) {
    throw new NotFoundError('Service', id)
  }

  // Check if service is used in bookings
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', id)

  if (count && count > 0) {
    throw new ValidationError('Nie można usunąć usługi, która jest używana w rezerwacjach. Możesz ją dezaktywować.')
  }

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)

  if (error) throw error

  return NextResponse.json({ success: true })
})
