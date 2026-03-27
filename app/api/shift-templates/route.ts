import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ConflictError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface ShiftTemplate {
  id: string
  salon_id: string
  name: string
  start_time: string
  end_time: string
  color: string
  is_active: boolean
  created_at: string
}

interface CreateShiftTemplateBody {
  name: string
  start_time: string
  end_time: string
  color?: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseAndValidateBody(body: unknown): CreateShiftTemplateBody {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object')
  }

  const { name, start_time, end_time, color } = body as Record<string, unknown>
  const trimmedName = typeof name === 'string' ? name.trim() : ''

  if (!trimmedName) {
    throw new ValidationError('Name is required')
  }

  if (typeof start_time !== 'string' || !TIME_PATTERN.test(start_time)) {
    throw new ValidationError('start_time must be in HH:MM format')
  }

  if (typeof end_time !== 'string' || !TIME_PATTERN.test(end_time)) {
    throw new ValidationError('end_time must be in HH:MM format')
  }

  if (start_time >= end_time) {
    throw new ValidationError('start_time must be earlier than end_time')
  }

  if (color !== undefined && typeof color !== 'string') {
    throw new ValidationError('color must be a string')
  }

  return {
    name: trimmedName,
    start_time,
    end_time,
    color,
  }
}

// GET /api/shift-templates - List active shift templates for the authenticated salon
export const GET = withErrorHandling(
  async (_request: NextRequest): Promise<NextResponse> => {
    const { supabase, salonId } = await getAuthContext()

    const { data: templates, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .order('start_time', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      templates: (templates ?? []) as ShiftTemplate[],
    })
  }
)

// POST /api/shift-templates - Create a shift template for the authenticated salon
export const POST = withErrorHandling(
  async (request: NextRequest): Promise<NextResponse> => {
    const { supabase, salonId } = await getAuthContext()
    const body = parseAndValidateBody(await request.json())

    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from('shift_templates')
      .select('id')
      .eq('salon_id', salonId)
      .eq('name', body.name)
      .maybeSingle()

    if (existingTemplateError) throw existingTemplateError

    if (existingTemplate) {
      throw new ConflictError('Shift template name already exists')
    }

    const insertPayload: {
      salon_id: string
      name: string
      start_time: string
      end_time: string
      color?: string
    } = {
      salon_id: salonId,
      name: body.name,
      start_time: body.start_time,
      end_time: body.end_time,
    }

    if (body.color !== undefined) {
      insertPayload.color = body.color
    }

    const { data: template, error } = await supabase
      .from('shift_templates')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json(
      { template: template as ShiftTemplate },
      { status: 201 }
    )
  }
)
