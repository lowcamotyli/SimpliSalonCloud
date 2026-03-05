import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

const formFieldSchema = z.object({
  id: z.string(),
  type: z.enum([
    'text',
    'textarea',
    'checkbox',
    'radio',
    'select',
    'date',
    'signature',
    'photo_upload',
    'section_header',
  ]),
  label: z.string().min(1).max(500),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  conditionalShowIf: z
    .object({
      fieldId: z.string(),
      value: z.string(),
    })
    .optional(),
})

const formTemplateSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  fields: z.array(formFieldSchema).min(1).max(50),
  requires_signature: z.boolean().default(false),
  gdpr_consent_text: z.string().optional(),
})

// GET /api/forms/templates/[id] - get single template (auth: employee)
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

  const { data: template, error } = await supabase
    .from('form_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('FormTemplate', id)
    throw error
  }

  return NextResponse.json({ template })
})

// PUT /api/forms/templates/[id] - update template (auth: owner/manager)
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
  const validated = formTemplateSchema.parse(body)

  const { data: template, error } = await supabase
    .from('form_templates')
    .update(validated)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('FormTemplate', id)
    throw error
  }

  return NextResponse.json({ template })
})

// DELETE /api/forms/templates/[id] - soft delete (set is_active = false)
export const DELETE = withErrorHandling(async (
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

  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('FormTemplate', id)
    throw error
  }

  return NextResponse.json({ success: true })
})
