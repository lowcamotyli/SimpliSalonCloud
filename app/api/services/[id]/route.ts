import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateServiceSchema } from '@/lib/validators/service.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'

// GET /api/services/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: service, error } = await supabase
    .from('services')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Service', params.id)
    throw error
  }

  if (!service) {
    throw new NotFoundError('Service', params.id)
  }

  return NextResponse.json({ service })
})

// PATCH /api/services/[id] - Update service
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  // Verify service belongs to salon
  const { data: existingService, error: existingError } = await supabase
    .from('services')
    .select('id')
    .eq('id', params.id)
    .eq('salon_id', profile.salon_id)
    .single()

  if (existingError || !existingService) {
    throw new NotFoundError('Service', params.id)
  }

  const body = await request.json()
  const validatedData = updateServiceSchema.parse(body)

  const { data: service, error } = await supabase
    .from('services')
    .update({
      ...(validatedData.category !== undefined && { category: validatedData.category }),
      ...(validatedData.subcategory !== undefined && { subcategory: validatedData.subcategory }),
      ...(validatedData.name !== undefined && { name: validatedData.name }),
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.duration !== undefined && { duration: validatedData.duration }),
      ...(validatedData.price !== undefined && { price: validatedData.price }),
      ...(validatedData.active !== undefined && { active: validatedData.active }),
      ...(validatedData.surcharge_allowed !== undefined && { surcharge_allowed: validatedData.surcharge_allowed }),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ service })
})

// DELETE /api/services/[id] - Delete service
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  // Verify service belongs to salon
  const { data: existingService, error: existingError } = await supabase
    .from('services')
    .select('id')
    .eq('id', params.id)
    .eq('salon_id', profile.salon_id)
    .single()

  if (existingError || !existingService) {
    throw new NotFoundError('Service', params.id)
  }

  // Check if service is used in bookings
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', params.id)

  if (count && count > 0) {
    throw new ValidationError('Nie można usunąć usługi, która jest używana w rezerwacjach. Możesz ją dezaktywować.')
  }

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', params.id)

  if (error) throw error

  return NextResponse.json({ success: true })
})
