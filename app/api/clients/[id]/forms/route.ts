import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

// GET /api/clients/[id]/forms - list client forms history (auth: employee)
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
    .from('client_forms')
    .select(
      'id, submitted_at, signed_at, signature_url, created_at, fill_token_exp, form_template:form_templates(name)'
    )
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  if (error) throw error

  const forms = (rows ?? []).map((row: any) => ({
    id: row.id,
    submitted_at: row.submitted_at,
    signed_at: row.signed_at,
    signature_url: row.signature_url,
    created_at: row.created_at,
    fill_token_exp: row.fill_token_exp,
    template_name: row.form_template?.name ?? null,
  }))

  return NextResponse.json({ forms })
})
