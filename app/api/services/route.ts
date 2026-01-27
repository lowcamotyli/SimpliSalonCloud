import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSchema } from '@/lib/validators/service.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

// GET /api/services - List all services
export const GET = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
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

  const { data: services, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', profile.salon_id)
    .eq('active', true)
    .is('deleted_at', null)
    .order('category')
    .order('subcategory')
    .order('name')

  if (error) throw error

  // Group services by category and subcategory
  const grouped: any = {}

  services?.forEach((service) => {
    if (!grouped[service.category]) {
      grouped[service.category] = {
        category: service.category,
        subcategories: {},
      }
    }

    if (!grouped[service.category].subcategories[service.subcategory]) {
      grouped[service.category].subcategories[service.subcategory] = {
        name: service.subcategory,
        services: [],
      }
    }

    grouped[service.category].subcategories[service.subcategory].services.push({
      id: service.id,
      name: service.name,
      price: service.price,
      duration: service.duration,
      surchargeAllowed: service.surcharge_allowed,
    })
  })

  // Convert to array format
  const servicesTree = Object.values(grouped).map((cat: any) => ({
    category: cat.category,
    subcategories: Object.values(cat.subcategories),
  }))

  return NextResponse.json({ services: servicesTree })
})

// POST /api/services - Create new service
export const POST = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
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

  const body = await request.json()
  const validatedData = createServiceSchema.parse({
    ...body,
    salon_id: (profile as any).salon_id, // Auto-add salon_id from user profile
  })

  const { data: service, error } = await supabase
    .from('services')
    .insert({
      salon_id: validatedData.salon_id,
      category: validatedData.category,
      subcategory: validatedData.subcategory,
      name: validatedData.name,
      duration: validatedData.duration,
      price: validatedData.price,
      active: validatedData.active ?? true,
      surcharge_allowed: validatedData.surcharge_allowed ?? true,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ service }, { status: 201 })
})
