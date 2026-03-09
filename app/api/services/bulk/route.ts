import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { withErrorHandling } from '@/lib/error-handler'
import { z } from 'zod'

const bulkCreateServicesSchema = z.object({
  services: z
    .array(
      z.object({
        category: z.string(),
        subcategory: z.string(),
        name: z.string(),
        duration: z.number(),
        price: z.number(),
        active: z.boolean().optional(),
        surcharge_allowed: z.boolean().optional(),
      })
    )
    .min(1)
    .max(500),
})

// POST /api/services/bulk - Bulk create services for CSV import
export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const body = await request.json()
  const validatedBody = bulkCreateServicesSchema.parse(body)

  // Fetch existing services to skip duplicates (match on salon_id + name + category + subcategory)
  const { data: existing } = await supabase
    .from('services')
    .select('name, category, subcategory')
    .eq('salon_id', salonId)
    .is('deleted_at', null)

  const existingKeys = new Set(
    (existing ?? []).map((s) => `${s.category}|${s.subcategory}|${s.name}`.toLowerCase())
  )

  const newRows = validatedBody.services
    .filter((s) => !existingKeys.has(`${s.category}|${s.subcategory}|${s.name}`.toLowerCase()))
    .map((service) => ({
      salon_id: salonId,
      category: service.category,
      subcategory: service.subcategory,
      name: service.name,
      duration: service.duration,
      price: service.price,
      active: service.active ?? true,
      surcharge_allowed: service.surcharge_allowed ?? true,
    }))

  const skipped = validatedBody.services.length - newRows.length

  if (newRows.length === 0) {
    return NextResponse.json({ imported: 0, skipped }, { status: 200 })
  }

  const { data, error } = await supabase
    .from('services')
    .insert(newRows)
    .select('id, name')

  if (error) throw error

  return NextResponse.json({ imported: data?.length ?? 0, skipped }, { status: 201 })
})
