import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

const createBeautyPlanSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
})

// GET /api/clients/[id]/beauty-plans - list beauty plans with steps (auth: employee)
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

  const { data: plans, error: plansError } = await supabase
    .from('beauty_plans')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  if (plansError) throw plansError

  if (!plans || plans.length === 0) {
    return NextResponse.json({ plans: [] })
  }

  const planIds = plans.map((plan) => plan.id)
  const { data: steps, error: stepsError } = await supabase
    .from('beauty_plan_steps')
    .select('*')
    .in('plan_id', planIds)
    .order('step_order', { ascending: true })

  if (stepsError) throw stepsError

  const stepsByPlanId = new Map<string, any[]>()
  for (const step of steps ?? []) {
    const existing = stepsByPlanId.get(step.plan_id) ?? []
    existing.push(step)
    stepsByPlanId.set(step.plan_id, existing)
  }

  const plansWithSteps = plans.map((plan) => ({
    ...plan,
    beauty_plan_steps: stepsByPlanId.get(plan.id) ?? [],
  }))

  return NextResponse.json({ plans: plansWithSteps })
})

// POST /api/clients/[id]/beauty-plans - create beauty plan (auth: employee)
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

  const body = await request.json()
  const validated = createBeautyPlanSchema.parse(body)

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (employeeError) {
    if (employeeError.code === 'PGRST116') throw new NotFoundError('Employee')
    throw employeeError
  }

  const { data: plan, error: insertError } = await supabase
    .from('beauty_plans')
    .insert({
      client_id: id,
      created_by: employee.id,
      title: validated.title,
      description: validated.description ?? null,
      status: 'active',
    })
    .select()
    .single()

  if (insertError) throw insertError

  return NextResponse.json({ plan }, { status: 201 })
})
