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

// GET /api/forms/templates - list active templates for salon (auth: any employee)
export const GET = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }
  const { data: templates, error } = await supabase
    .from('form_templates')
    .select('*')
    .eq('salon_id', typedProfile.salon_id)
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return NextResponse.json({ templates: templates ?? [] })
})

// POST /api/forms/templates - create template (auth: owner/manager only)
export const POST = withErrorHandling(async (request: NextRequest) => {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }
  const body = await request.json()
  const validated = formTemplateSchema.parse(body)

  const { data: template, error } = await supabase
    .from('form_templates')
    .insert({
      salon_id: typedProfile.salon_id,
      ...validated,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ template }, { status: 201 })
})
