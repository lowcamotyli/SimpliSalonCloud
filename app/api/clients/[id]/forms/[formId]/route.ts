import { NextRequest, NextResponse } from 'next/server'
import { decryptAnswers } from '@/lib/forms/encryption'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'

function byteaHexToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/^\\x/, ''), 'hex')
}

// GET /api/clients/[id]/forms/[formId] - get single form with decrypted answers (auth: employee)
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; formId: string }> }
) => {
  const { id, formId } = await params

  const serverSupabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await serverSupabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const adminSupabase = createAdminSupabaseClient()

  const { data: clientForm, error: formError } = await adminSupabase
    .from('client_forms')
    .select('id, client_id, form_template_id, answers, answers_iv, answers_tag')
    .eq('id', formId)
    .eq('client_id', id)
    .single()

  if (formError) {
    if (formError.code === 'PGRST116') throw new NotFoundError('ClientForm', formId)
    throw formError
  }

  if (!clientForm.answers || !clientForm.answers_iv || !clientForm.answers_tag) {
    throw new ValidationError('Form does not contain encrypted answers')
  }

  const { data: template, error: templateError } = await adminSupabase
    .from('form_templates')
    .select('fields, name, requires_signature')
    .eq('id', clientForm.form_template_id)
    .single()

  if (templateError) {
    if (templateError.code === 'PGRST116') {
      throw new NotFoundError('FormTemplate', clientForm.form_template_id)
    }
    throw templateError
  }

  const decrypted = decryptAnswers(
    byteaHexToBuffer(clientForm.answers),
    byteaHexToBuffer(clientForm.answers_iv),
    byteaHexToBuffer(clientForm.answers_tag)
  )

  return NextResponse.json({
    answers: decrypted,
    template: {
      fields: template.fields,
      name: template.name,
      requires_signature: template.requires_signature,
    },
  })
})
