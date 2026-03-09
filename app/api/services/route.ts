import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createServiceSchema } from '@/lib/validators/service.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { applyRateLimit } from '@/lib/middleware/rate-limit'

// GET /api/services - List all services
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const { data: services, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', salonId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('category')
    .order('subcategory')
    .order('name')

  if (error) throw error

  // Group services by category and subcategory
  const grouped: any = {}

  services?.forEach((service: any) => {
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
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl

  const { supabase, salonId } = await getAuthContext()

  const body = await request.json()
  const validatedData = createServiceSchema.parse({
    ...body,
    salon_id: salonId,
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
