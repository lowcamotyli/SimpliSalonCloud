import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type RouteContext = {
  params: Promise<{ id: string; ruleId: string }>
}

type RuleType = 'fixed' | 'alternating'

interface ShiftRule {
  id: string
  salon_id: string
  employee_id: string
  name: string
  rule_type: RuleType
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
  created_at: string
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function validateDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('days_of_week must be a non-empty array')
  }

  const normalized = new Set<number>()
  for (const day of value) {
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
      throw new ValidationError('days_of_week must contain integers from 1 to 7')
    }
    normalized.add(day)
  }

  return [...normalized].sort((a, b) => a - b)
}

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

async function getRule(
  ruleId: string,
  employeeId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<ShiftRule> {
  const { data: rule, error } = await supabase
    .from('shift_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('employee_id', employeeId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  if (!rule) throw new NotFoundError('Shift rule', ruleId)

  return rule as ShiftRule
}

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId, ruleId } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(employeeId, salonId, supabase)
  const existingRule = await getRule(ruleId, employeeId, salonId, supabase)

  const body = await request.json()
  const updates: Partial<ShiftRule> = {}

  if (body?.name !== undefined) {
    const name = normalizeString(body.name)
    if (!name) {
      throw new ValidationError('name must be a non-empty string')
    }
    updates.name = name
  }

  if (body?.rule_type !== undefined) {
    if (body.rule_type !== 'fixed' && body.rule_type !== 'alternating') {
      throw new ValidationError('rule_type must be fixed or alternating')
    }
    updates.rule_type = body.rule_type as RuleType
  }

  if (body?.template_a_id !== undefined) {
    const templateAId = normalizeString(body.template_a_id)
    if (!templateAId) {
      throw new ValidationError('template_a_id must be a non-empty string')
    }
    await ensureTemplateExists(templateAId, salonId, supabase)
    updates.template_a_id = templateAId
  }

  if (body?.template_b_id !== undefined) {
    if (body.template_b_id === null) {
      updates.template_b_id = null
    } else {
      const templateBId = normalizeString(body.template_b_id)
      if (!templateBId) {
        throw new ValidationError('template_b_id must be a non-empty string or null')
      }
      await ensureTemplateExists(templateBId, salonId, supabase)
      updates.template_b_id = templateBId
    }
  }

  if (body?.days_of_week !== undefined) {
    updates.days_of_week = validateDaysOfWeek(body.days_of_week)
  }

  if (body?.reference_week !== undefined) {
    if (body.reference_week === null) {
      updates.reference_week = null
    } else {
      const referenceWeek = normalizeString(body.reference_week)
      if (!referenceWeek || !isIsoDate(referenceWeek)) {
        throw new ValidationError('reference_week must be in YYYY-MM-DD format or null')
      }
      updates.reference_week = referenceWeek
    }
  }

  if (body?.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean')
    }
    updates.is_active = body.is_active
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update')
  }

  const finalRuleType = updates.rule_type ?? existingRule.rule_type
  const finalTemplateBId = updates.template_b_id === undefined ? existingRule.template_b_id : updates.template_b_id
  const finalReferenceWeek = updates.reference_week === undefined ? existingRule.reference_week : updates.reference_week

  if (finalRuleType === 'alternating') {
    if (!finalTemplateBId) {
      throw new ValidationError('alternating rule requires template_b_id')
    }
    if (!finalReferenceWeek || !isIsoDate(finalReferenceWeek)) {
      throw new ValidationError('alternating rule requires reference_week in YYYY-MM-DD format')
    }
  }

  const { data: rule, error } = await supabase
    .from('shift_rules')
    .update(updates)
    .eq('id', ruleId)
    .eq('employee_id', employeeId)
    .eq('salon_id', salonId)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json({ rule: rule as ShiftRule })
})

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId, ruleId } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(employeeId, salonId, supabase)
  await getRule(ruleId, employeeId, salonId, supabase)

  const { error } = await supabase
    .from('shift_rules')
    .update({ is_active: false })
    .eq('id', ruleId)
    .eq('employee_id', employeeId)
    .eq('salon_id', salonId)

  if (error) throw error

  return NextResponse.json({ success: true })
})
