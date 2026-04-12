import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Tables, TablesInsert } from '@/types/supabase'

type AddonTemplate = Tables<'addon_templates'>

const createAddonTemplateSchema = z.object({
  name: z.string().min(1),
  price_delta: z.number().default(0),
  duration_delta: z.number().int().default(0),
})

export const GET = withErrorHandling(async (_request: NextRequest): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()

  const { data: templates, error } = await supabase
    .from('addon_templates')
    .select('*')
    .eq('salon_id', salonId)
    .order('name', { ascending: true })

  if (error) throw error

  return NextResponse.json({
    templates: (templates ?? []) as AddonTemplate[],
  })
})

export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()
  const body = createAddonTemplateSchema.parse(await request.json())

  const insertPayload: TablesInsert<'addon_templates'> = {
    salon_id: salonId,
    name: body.name.trim(),
    price_delta: body.price_delta,
    duration_delta: body.duration_delta,
  }

  const { data: template, error } = await supabase
    .from('addon_templates')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json(
    { template: template as AddonTemplate },
    { status: 201 }
  )
})
