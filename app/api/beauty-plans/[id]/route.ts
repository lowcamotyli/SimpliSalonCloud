import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors'

const updateBeautyPlanSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'completed', 'abandoned']).optional(),
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

// GET /api/beauty-plans/[id] - get beauty plan with steps (auth: employee)
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

  await requireEmployeeAccess(supabase, user.id)

  const { data: plan, error: planError } = await supabase
    .from('beauty_plans')
    .select('*, beauty_plan_steps(*)')
    .eq('id', id)
    .single()

  if (planError) {
    if (planError.code === 'PGRST116') throw new NotFoundError('BeautyPlan', id)
    throw planError
  }

  return NextResponse.json({ plan })
})

// PUT /api/beauty-plans/[id] - update beauty plan (auth: employee)
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

  await requireEmployeeAccess(supabase, user.id)

  const body = await request.json()
  const validated = updateBeautyPlanSchema.parse(body)

  const updatePayload: Record<string, unknown> = {}

  if (validated.title !== undefined) updatePayload.title = validated.title
  if (validated.description !== undefined) updatePayload.description = validated.description
  if (validated.status !== undefined) updatePayload.status = validated.status

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No fields to update')
  }

  const { data: plan, error: updateError } = await supabase
    .from('beauty_plans')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    if (updateError.code === 'PGRST116') throw new NotFoundError('BeautyPlan', id)
    throw updateError
  }

  return NextResponse.json({ plan })
})
