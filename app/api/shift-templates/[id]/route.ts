import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
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

type RouteContext = {
  params: Promise<{ id: string }>
}

function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function validateTimeOrder(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw new ValidationError('start_time must be earlier than end_time')
  }
}

async function ensureTemplateExists(
  templateId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<void> {
  const { data: template, error } = await supabase
    .from('shift_templates')
    .select('id')
    .eq('id', templateId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  if (!template) throw new NotFoundError('Shift template', templateId)
}

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()
  await ensureTemplateExists(id, salonId, supabase)

  const body = await request.json()
  const updates: Partial<ShiftTemplate> = {}

  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name must be a non-empty string')
    }
    updates.name = body.name.trim()
  }

  if (body?.color !== undefined) {
    if (typeof body.color !== 'string' || body.color.trim().length === 0) {
      throw new ValidationError('color must be a non-empty string')
    }
    updates.color = body.color.trim()
  }

  if (body?.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean')
    }
    updates.is_active = body.is_active
  }

  const hasStartTime = body?.start_time !== undefined
  const hasEndTime = body?.end_time !== undefined

  if (hasStartTime || hasEndTime) {
    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from('shift_templates')
      .select('start_time, end_time')
      .eq('id', id)
      .eq('salon_id', salonId)
      .single()

    if (existingTemplateError || !existingTemplate) {
      throw new NotFoundError('Shift template', id)
    }

    const providedStartTime = hasStartTime ? normalizeTime(body.start_time) : undefined
    const providedEndTime = hasEndTime ? normalizeTime(body.end_time) : undefined

    if (hasStartTime && !providedStartTime) {
      throw new ValidationError('start_time must be a non-empty string')
    }
    if (hasEndTime && !providedEndTime) {
      throw new ValidationError('end_time must be a non-empty string')
    }

    const nextStartTime = providedStartTime ?? existingTemplate.start_time
    const nextEndTime = providedEndTime ?? existingTemplate.end_time

    validateTimeOrder(nextStartTime, nextEndTime)

    if (providedStartTime) updates.start_time = providedStartTime
    if (providedEndTime) updates.end_time = providedEndTime
  }

  const { data: template, error } = await supabase
    .from('shift_templates')
    .update(updates)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json({ template: template as ShiftTemplate })
})

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()
  await ensureTemplateExists(id, salonId, supabase)

  const { error } = await supabase
    .from('shift_templates')
    .update({ is_active: false })
    .eq('id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return NextResponse.json({ success: true })
})
