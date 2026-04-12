import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

const batchServiceActionSchema = z.object({
  ids: z.string().uuid().array().min(1).max(100),
  action: z.enum(['activate', 'deactivate']),
})

const batchDeleteSchema = z.object({
  ids: z.string().uuid().array().min(1).max(100),
})

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const body = await request.json()
  const validatedBody = batchServiceActionSchema.parse(body)
  const shouldActivate = validatedBody.action === 'activate'

  const { data, error } = await supabase
    .from('services')
    .update({ active: shouldActivate })
    .in('id', validatedBody.ids)
    .eq('salon_id', salonId)
    .select('id')

  if (error) throw error

  return NextResponse.json({ updated_count: data?.length ?? 0 })
})

export const DELETE = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const body = await request.json()
  const { ids } = batchDeleteSchema.parse(body)

  const { data, error } = await supabase
    .from('services')
    .delete()
    .in('id', ids)
    .eq('salon_id', salonId)
    .select('id')

  if (error) throw error

  return NextResponse.json({ deleted_count: data?.length ?? 0 })
})
