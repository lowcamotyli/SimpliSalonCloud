import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createServiceSchema } from '@/lib/validators/service.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { applyRateLimit } from '@/lib/middleware/rate-limit'
import { ValidationError } from '@/lib/errors'
import { SERVICE_PRICE_TYPES, normalizeServicePriceType } from '@/lib/services/price-types'

const VALID_PRICE_TYPES = SERVICE_PRICE_TYPES

// GET /api/services - List all services
export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const { data: services, error } = await supabase
    .from('services')
    .select('*, employee_services(count)')
    .eq('salon_id', salonId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('category')
    .order('subcategory')
    .order('name')

  if (error) throw error

  services?.forEach((service: any) => {
    service.assigned_employee_count = service.employee_services?.[0]?.count ?? 0
    delete service.employee_services
  })

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
      price_type: normalizeServicePriceType(service.price_type),
      duration: service.duration,
      description: service.description,
      surchargeAllowed: service.surcharge_allowed,
      assignedEmployeeCount: service.assigned_employee_count,
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
  const priceType = body.price_type ?? 'fixed'

  if (!VALID_PRICE_TYPES.includes(priceType)) {
    throw new ValidationError('Invalid price_type')
  }

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
      price_type: priceType,
      description: validatedData.description ?? null,
      active: validatedData.active ?? true,
      surcharge_allowed: validatedData.surcharge_allowed ?? true,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ service }, { status: 201 })
})
