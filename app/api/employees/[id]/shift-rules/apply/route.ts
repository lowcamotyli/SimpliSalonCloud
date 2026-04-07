import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type RouteContext = {
  params: Promise<{ id: string }>
}

type RuleType = 'fixed' | 'alternating'

interface ShiftRule {
  id: string
  employee_id: string
  salon_id: string
  rule_type: RuleType
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
}

interface ExistingShift {
  date: string
}

interface ShiftTemplate {
  id: string
  start_time: string
  end_time: string
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseDateUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getMondayUtc(date: Date): Date {
  const monday = new Date(date)
  const dayIndex = (date.getUTCDay() + 6) % 7
  monday.setUTCDate(date.getUTCDate() - dayIndex)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

function getMonBasedDayOfWeek(date: Date): number {
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
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

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(employeeId, salonId, supabase)

  const body = await request.json()
  const from = typeof body?.from === 'string' ? body.from.trim() : ''
  const to = typeof body?.to === 'string' ? body.to.trim() : ''

  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new ValidationError('from and to must be in YYYY-MM-DD format')
  }

  if (from > to) {
    throw new ValidationError('from must be earlier than or equal to to')
  }

  const { data: rulesData, error: rulesError } = await supabase
    .from('shift_rules')
    .select('id, employee_id, salon_id, rule_type, template_a_id, template_b_id, days_of_week, reference_week, is_active')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .eq('is_active', true)

  if (rulesError) throw rulesError

  const rules = (rulesData ?? []) as ShiftRule[]

  const { data: existingShiftsData, error: existingShiftsError } = await supabase
    .from('employee_shifts')
    .select('date')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .gte('date', from)
    .lte('date', to)

  if (existingShiftsError) throw existingShiftsError

  const existingShiftDates = new Set<string>((existingShiftsData ?? []).map((shift) => (shift as ExistingShift).date))

  const templateIds = new Set<string>()
  for (const rule of rules) {
    templateIds.add(rule.template_a_id)
    if (rule.template_b_id) {
      templateIds.add(rule.template_b_id)
    }
  }

  const templateIdList = [...templateIds]
  const templatesMap = new Map<string, ShiftTemplate>()

  if (templateIdList.length > 0) {
    const { data: templatesData, error: templatesError } = await supabase
      .from('shift_templates')
      .select('id, start_time, end_time')
      .eq('salon_id', salonId)
      .in('id', templateIdList)

    if (templatesError) throw templatesError

    for (const template of templatesData ?? []) {
      const typedTemplate = template as ShiftTemplate
      templatesMap.set(typedTemplate.id, typedTemplate)
    }
  }

  let created = 0
  let skipped = 0

  const fromDate = parseDateUtc(from)
  const toDate = parseDateUtc(to)
  const weekMs = 7 * 24 * 60 * 60 * 1000

  for (
    let currentDay = new Date(fromDate);
    currentDay.getTime() <= toDate.getTime();
    currentDay.setUTCDate(currentDay.getUTCDate() + 1)
  ) {
    const currentDate = new Date(currentDay)
    const dateString = formatDateUtc(currentDate)
    const dayOfWeek = getMonBasedDayOfWeek(currentDate)

    for (const rule of rules) {
      if (!rule.days_of_week.includes(dayOfWeek)) {
        continue
      }

      if (existingShiftDates.has(dateString)) {
        skipped += 1
        continue
      }

      let targetTemplateId = rule.template_a_id

      if (rule.rule_type === 'alternating') {
        if (!rule.template_b_id || !rule.reference_week || !isIsoDate(rule.reference_week)) {
          throw new ValidationError(`Rule ${rule.id} is invalid: alternating rules require template_b_id and reference_week`)
        }

        const mondayOfDay = getMondayUtc(currentDate)
        const mondayOfReference = getMondayUtc(parseDateUtc(rule.reference_week))
        const weekDiff = Math.floor((mondayOfDay.getTime() - mondayOfReference.getTime()) / weekMs)

        targetTemplateId = weekDiff % 2 === 0 ? rule.template_a_id : rule.template_b_id
      }

      const template = templatesMap.get(targetTemplateId)
      if (!template) {
        throw new NotFoundError('Shift template', targetTemplateId)
      }

      const { error: insertError } = await supabase
        .from('employee_shifts')
        .insert({
          employee_id: employeeId,
          salon_id: salonId,
          date: dateString,
          shift_template_id: targetTemplateId,
          start_time: template.start_time,
          end_time: template.end_time,
        })

      if (insertError) {
        if ((insertError as { code?: string }).code === '23505') {
          skipped += 1
          existingShiftDates.add(dateString)
          continue
        }
        throw insertError
      }

      existingShiftDates.add(dateString)
      created += 1
    }
  }

  return NextResponse.json({ created, skipped })
})
