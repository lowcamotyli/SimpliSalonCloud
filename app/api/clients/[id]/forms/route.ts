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

  const [{ data: cfRows, error }, { data: parRows }] = await Promise.all([
    supabase
      .from('client_forms')
      .select('id, submitted_at, signed_at, signature_url, created_at, fill_token_exp, form_template_id, form_template:form_templates(name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('pre_appointment_responses')
      .select('id, submitted_at, created_at, form_template_id')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (error) throw error

  const forms = [
    ...(cfRows ?? []).map((row: any) => ({
      id: row.id,
      submitted_at: row.submitted_at,
      signed_at: row.signed_at,
      signature_url: row.signature_url,
      created_at: row.created_at,
      fill_token_exp: row.fill_token_exp,
      template_name: row.form_template?.name ?? null,
      form_template_id: row.form_template_id,
      source: 'client_form' as const,
    })),
    ...(parRows ?? []).map((row: any) => ({
      id: row.id,
      submitted_at: row.submitted_at,
      signed_at: null,
      signature_url: null,
      created_at: row.created_at,
      fill_token_exp: null,
      template_name: 'Formularz przed wizytą',
      form_template_id: row.form_template_id,
      source: 'pre_appointment' as const,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ forms })
})
