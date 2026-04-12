import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { TablesInsert } from '@/types/supabase'

const batchAddonSchema = z.object({
  service_ids: z.string().uuid().array().min(1).max(100),
  template_ids: z.string().uuid().array().min(1).max(50),
})

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()
  const body = batchAddonSchema.parse(await request.json())

  const { data: templates, error: templatesError } = await supabase
    .from('addon_templates')
    .select('id, name, price_delta, duration_delta')
    .in('id', body.template_ids)
    .eq('salon_id', salonId)

  if (templatesError) throw templatesError
  if ((templates?.length ?? 0) !== body.template_ids.length) {
    throw new ValidationError('One or more addon templates were not found')
  }

  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id')
    .in('id', body.service_ids)
    .eq('salon_id', salonId)

  if (servicesError) throw servicesError
  if ((services?.length ?? 0) !== body.service_ids.length) {
    throw new ValidationError('One or more services were not found')
  }

  const insertRows: TablesInsert<'service_addons'>[] = body.service_ids.flatMap((serviceId) =>
    (templates ?? []).map((template) => ({
      salon_id: salonId,
      service_id: serviceId,
      name: template.name,
      price_delta: template.price_delta,
      duration_delta: template.duration_delta,
      is_active: true,
    }))
  )

  const { data, error } = await supabase
    .from('service_addons')
    .upsert(insertRows, {
      onConflict: 'salon_id,service_id,name',
      ignoreDuplicates: false,
    })
    .select('id')

  if (error) throw error

  return NextResponse.json({ assigned_count: data?.length ?? insertRows.length })
})

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()
  const body = batchAddonSchema.parse(await request.json())

  const { data: templates, error: templatesError } = await supabase
    .from('addon_templates')
    .select('name')
    .in('id', body.template_ids)
    .eq('salon_id', salonId)

  if (templatesError) throw templatesError
  if ((templates?.length ?? 0) !== body.template_ids.length) {
    throw new ValidationError('One or more addon templates were not found')
  }

  const templateNames = (templates ?? []).map((template) => template.name)

  const { data, error } = await supabase
    .from('service_addons')
    .update({ is_active: false })
    .eq('salon_id', salonId)
    .in('service_id', body.service_ids)
    .in('name', templateNames)
    .eq('is_active', true)
    .select('id')

  if (error) throw error

  return NextResponse.json({ removed_count: data?.length ?? 0 })
})
