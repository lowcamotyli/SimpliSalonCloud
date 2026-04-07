import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { TablesInsert } from '@/types/supabase'

type RouteContext = {
  params: Promise<{ id: string }>
}

type RuleType = 'fixed' | 'alternating'

type ShiftRuleTemplate = {
  name: string
  color: string
}

type ShiftRuleRow = {
  id: string
  salon_id: string
  employee_id: string
  name: string
  rule_type: string
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
  created_at: string
}

type ShiftRuleResponse = ShiftRuleRow & {
  template_a: ShiftRuleTemplate | null
  template_b: ShiftRuleTemplate | null
}

type ShiftRuleSelectRow = ShiftRuleRow & {
  template_a: ShiftRuleTemplate | null
  template_b: ShiftRuleTemplate | null
}

type CreateShiftRuleBody = {
  name: string
  rule_type: RuleType
  template_a_id: string
  template_b_id?: string
  days_of_week: number[]
  reference_week?: string
}

const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/

async function ensureEmployeeExists(
  employeeId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<void> {
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  if (!employee) throw new NotFoundError('Employee', employeeId)
}

function isRuleType(value: unknown): value is RuleType {
  return value === 'fixed' || value === 'alternating'
}

function parseAndValidateBody(body: unknown): CreateShiftRuleBody {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object')
  }

  const {
    name,
    rule_type,
    template_a_id,
    template_b_id,
    days_of_week,
    reference_week,
  } = body as Record<string, unknown>

  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const templateAId = typeof template_a_id === 'string' ? template_a_id.trim() : ''
  const templateBId = typeof template_b_id === 'string' ? template_b_id.trim() : ''
  const normalizedReferenceWeek = typeof reference_week === 'string' ? reference_week.trim() : ''

  if (!trimmedName) {
    throw new ValidationError('name is required')
  }

  if (!isRuleType(rule_type)) {
    throw new ValidationError('rule_type must be fixed or alternating')
  }

  if (!templateAId) {
    throw new ValidationError('template_a_id is required')
  }

  if (!Array.isArray(days_of_week) || days_of_week.length === 0) {
    throw new ValidationError('days_of_week must contain at least one day')
  }

  const normalizedDays = Array.from(
    new Set(
      days_of_week.map((value) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) {
          throw new ValidationError('days_of_week must contain integers from 0 to 6')
        }

        return value
      })
    )
  ).sort((left, right) => left - right)

  if (rule_type === 'alternating') {
    if (!templateBId) {
      throw new ValidationError('template_b_id is required for alternating rules')
    }

    if (!normalizedReferenceWeek || !ISO_WEEK_PATTERN.test(normalizedReferenceWeek)) {
      throw new ValidationError('reference_week must be in YYYY-Www format')
    }
  }

  return {
    name: trimmedName,
    rule_type,
    template_a_id: templateAId,
    template_b_id: templateBId || undefined,
    days_of_week: normalizedDays,
    reference_week: normalizedReferenceWeek || undefined,
  }
}

async function ensureTemplateBelongsToSalon(
  templateId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<void> {
  const { data: template, error } = await supabase
    .from('shift_templates')
    .select('id')
    .eq('id', templateId)
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  if (!template) throw new NotFoundError('Shift template', templateId)
}

function mapShiftRule(row: ShiftRuleSelectRow): ShiftRuleResponse {
  return {
    id: row.id,
    salon_id: row.salon_id,
    employee_id: row.employee_id,
    name: row.name,
    rule_type: row.rule_type,
    template_a_id: row.template_a_id,
    template_b_id: row.template_b_id,
    days_of_week: row.days_of_week,
    reference_week: row.reference_week,
    is_active: row.is_active,
    created_at: row.created_at,
    template_a: row.template_a,
    template_b: row.template_b,
  }
}

export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(employeeId, salonId, supabase)

  const { data, error } = await supabase
    .from('shift_rules')
    .select(`
      id,
      salon_id,
      employee_id,
      name,
      rule_type,
      template_a_id,
      template_b_id,
      days_of_week,
      reference_week,
      is_active,
      created_at,
      template_a:shift_templates!shift_rules_template_a_id_fkey (
        name,
        color
      ),
      template_b:shift_templates!shift_rules_template_b_id_fkey (
        name,
        color
      )
    `)
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) throw error

  return NextResponse.json({
    data: ((data ?? []) as ShiftRuleSelectRow[]).map(mapShiftRule),
  })
})

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(employeeId, salonId, supabase)

  const body = parseAndValidateBody(await request.json())

  await ensureTemplateBelongsToSalon(body.template_a_id, salonId, supabase)

  if (body.rule_type === 'alternating' && body.template_b_id) {
    await ensureTemplateBelongsToSalon(body.template_b_id, salonId, supabase)
  }

  const insertPayload: TablesInsert<'shift_rules'> = {
    salon_id: salonId,
    employee_id: employeeId,
    name: body.name,
    rule_type: body.rule_type,
    template_a_id: body.template_a_id,
    template_b_id: body.rule_type === 'alternating' ? body.template_b_id ?? null : null,
    days_of_week: body.days_of_week,
    reference_week: body.rule_type === 'alternating' ? body.reference_week ?? null : null,
  }

  const { data, error } = await supabase
    .from('shift_rules')
    .insert(insertPayload)
    .select(`
      id,
      salon_id,
      employee_id,
      name,
      rule_type,
      template_a_id,
      template_b_id,
      days_of_week,
      reference_week,
      is_active,
      created_at,
      template_a:shift_templates!shift_rules_template_a_id_fkey (
        name,
        color
      ),
      template_b:shift_templates!shift_rules_template_b_id_fkey (
        name,
        color
      )
    `)
    .single()

  if (error) throw error

  return NextResponse.json(
    {
      data: mapShiftRule(data as ShiftRuleSelectRow),
    },
    { status: 201 }
  )
})
