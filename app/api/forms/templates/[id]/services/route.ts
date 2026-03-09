import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

const serviceIdsSchema = z.object({
  serviceIds: z.array(z.string().uuid()),
})

// GET /api/forms/templates/[id]/services - list services assigned to a form template
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: rows, error } = await supabase
    .from('service_forms')
    .select('service_id')
    .eq('form_template_id', id)

  if (error) throw error

  const serviceIds = (rows ?? []).map((row) => row.service_id)

  return NextResponse.json({ serviceIds })
})

// PUT /api/forms/templates/[id]/services - replace service assignments for a form template
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const { serviceIds } = serviceIdsSchema.parse(body)

  const { error: deleteError } = await supabase
    .from('service_forms')
    .delete()
    .eq('form_template_id', id)

  if (deleteError) throw deleteError

  if (serviceIds.length > 0) {
    const rows = serviceIds.map((serviceId) => ({
      service_id: serviceId,
      form_template_id: id,
    }))

    const { error: insertError } = await supabase
      .from('service_forms')
      .insert(rows)

    if (insertError) throw insertError
  }

  return NextResponse.json({ ok: true })
})
