import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'

const updateStepSchema = z
  .object({
    is_completed: z.boolean().optional(),
    notes: z.string().optional(),
    planned_date: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })

async function requireEmployeeAccess(supabase: any, userId: string) {
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new UnauthorizedError('Employee access required')
    }
    throw error
  }

  return employee
}

// PATCH /api/beauty-plans/[id]/steps/[stepId] - update step (auth: employee)
export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) => {
  const { id, stepId } = await params
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  await requireEmployeeAccess(supabase, user.id)

  const body = await request.json()
  const validated = updateStepSchema.parse(body)

  if (validated.planned_date !== undefined && validated.planned_date !== null) {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!isoDatePattern.test(validated.planned_date)) {
      throw new ValidationError('planned_date must be in YYYY-MM-DD format')
    }
  }

  const updatePayload: Record<string, unknown> = {}

  if (validated.is_completed !== undefined) updatePayload.is_completed = validated.is_completed
  if (validated.notes !== undefined) updatePayload.notes = validated.notes
  if (validated.planned_date !== undefined) updatePayload.planned_date = validated.planned_date

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No fields to update')
  }

  const { data: step, error: updateError } = await supabase
    .from('beauty_plan_steps')
    .update(updatePayload)
    .eq('id', stepId)
    .eq('plan_id', id)
    .select()
    .single()

  if (updateError) {
    if (updateError.code === 'PGRST116') throw new NotFoundError('BeautyPlanStep', stepId)
    throw updateError
  }

  return NextResponse.json({ step })
})
