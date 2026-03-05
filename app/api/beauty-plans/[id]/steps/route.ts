import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

const createStepSchema = z.object({
  service_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  step_order: z.number().int(),
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

// POST /api/beauty-plans/[id]/steps - add step to plan (auth: employee)
export const POST = withErrorHandling(async (
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
  const validated = createStepSchema.parse(body)

  const { data: step, error: insertError } = await supabase
    .from('beauty_plan_steps')
    .insert({
      plan_id: id,
      service_id: validated.service_id ?? null,
      booking_id: validated.booking_id ?? null,
      planned_date: validated.planned_date ?? null,
      notes: validated.notes ?? null,
      step_order: validated.step_order,
    })
    .select()
    .single()

  if (insertError) throw insertError

  return NextResponse.json({ step }, { status: 201 })
})
