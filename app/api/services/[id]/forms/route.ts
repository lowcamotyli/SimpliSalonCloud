import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

const serviceFormsSchema = z.object({
  formTemplateIds: z.array(z.string()),
})

// GET /api/services/[id]/forms - list templates assigned to a service (auth: employee)
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
    .select('form_template:form_templates(*)')
    .eq('service_id', id)

  if (error) throw error

  const templates = (rows ?? [])
    .map((row: any) => row.form_template)
    .filter(Boolean)

  return NextResponse.json({ templates })
})

// PUT /api/services/[id]/forms - replace service form assignments (auth: owner/manager)
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

  const role = user.app_metadata?.role
  if (!['owner', 'manager'].includes(role)) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const { formTemplateIds } = serviceFormsSchema.parse(body)

  const { error: deleteError } = await supabase
    .from('service_forms')
    .delete()
    .eq('service_id', id)

  if (deleteError) throw deleteError

  if (formTemplateIds.length > 0) {
    const rows = formTemplateIds.map((formTemplateId) => ({
      service_id: id,
      form_template_id: formTemplateId,
    }))

    const { error: insertError } = await supabase
      .from('service_forms')
      .insert(rows)

    if (insertError) throw insertError
  }

  return NextResponse.json({ success: true, formTemplateIds })
})
