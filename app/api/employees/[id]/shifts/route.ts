import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors'
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

interface EmployeeShift {
  id: string
  salon_id: string
  employee_id: string
  shift_template_id: string | null
  date: string
  start_time: string
  end_time: string
  notes: string | null
  created_at: string
  template?: { name: string; color: string } | null
}

type RouteContext = {
  params: Promise<{ id: string }>
}

type EmployeeShiftWithTemplateRow = Omit<EmployeeShift, 'template'> & {
  shift_templates: { name: string; color: string } | null
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validateTimeOrder(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw new ValidationError('start_time must be earlier than end_time')
  }
}

function getCurrentWeekRange(): { from: string; to: string } {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const from = monday.toISOString().slice(0, 10)
  const to = sunday.toISOString().slice(0, 10)
  return { from, to }
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

export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId } = await params
  const { supabase, salonId } = await getAuthContext()
  await ensureEmployeeExists(employeeId, salonId, supabase)

  const fromParam = request.nextUrl.searchParams.get('from')?.trim()
  const toParam = request.nextUrl.searchParams.get('to')?.trim()
  const defaults = getCurrentWeekRange()
  const from = fromParam ?? defaults.from
  const to = toParam ?? defaults.to

  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new ValidationError('from and to must be in YYYY-MM-DD format')
  }

  if (from > to) {
    throw new ValidationError('from must be earlier than or equal to to')
  }

  const { data, error } = await supabase
    .from('employee_shifts')
    .select(`
      id,
      salon_id,
      employee_id,
      shift_template_id,
      date,
      start_time,
      end_time,
      notes,
      created_at,
      shift_templates (
        name,
        color
      )
    `)
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (error) throw error

  const shifts: EmployeeShift[] = ((data ?? []) as EmployeeShiftWithTemplateRow[]).map((row) => ({
    id: row.id,
    salon_id: row.salon_id,
    employee_id: row.employee_id,
    shift_template_id: row.shift_template_id,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    notes: row.notes,
    created_at: row.created_at,
    template: row.shift_templates
      ? {
          name: row.shift_templates.name,
          color: row.shift_templates.color,
        }
      : null,
  }))

  return NextResponse.json({ shifts })
})

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId } = await params
  const { supabase, salonId } = await getAuthContext()
  await ensureEmployeeExists(employeeId, salonId, supabase)

  const body = await request.json()
  const date = typeof body?.date === 'string' ? body.date.trim() : ''
  const shiftTemplateId = typeof body?.shift_template_id === 'string' && body.shift_template_id.trim().length > 0
    ? body.shift_template_id.trim()
    : undefined
  const inputStartTime = typeof body?.start_time === 'string' && body.start_time.trim().length > 0
    ? body.start_time.trim()
    : undefined
  const inputEndTime = typeof body?.end_time === 'string' && body.end_time.trim().length > 0
    ? body.end_time.trim()
    : undefined
  const notes = typeof body?.notes === 'string' ? body.notes : body?.notes === null ? null : undefined

  if (!date || !isIsoDate(date)) {
    throw new ValidationError('date must be in YYYY-MM-DD format')
  }

  if (!shiftTemplateId && (!inputStartTime || !inputEndTime)) {
    throw new ValidationError('must provide shift_template_id or both start_time and end_time')
  }

  let template: ShiftTemplate | null = null
  if (shiftTemplateId) {
    const { data: foundTemplate, error: templateError } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', shiftTemplateId)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (templateError) throw templateError
    if (!foundTemplate) throw new NotFoundError('Shift template', shiftTemplateId)
    template = foundTemplate as ShiftTemplate
  }

  const startTime = inputStartTime ?? template?.start_time
  const endTime = inputEndTime ?? template?.end_time

  if (!startTime || !endTime) {
    throw new ValidationError('start_time and end_time are required')
  }

  validateTimeOrder(startTime, endTime)

  const { data: existingShift, error: existingShiftError } = await supabase
    .from('employee_shifts')
    .select('id')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle()

  if (existingShiftError) throw existingShiftError
  if (existingShift) {
    throw new ConflictError('Pracownik ma juz zmiane w tym dniu')
  }

  const { data: insertedShift, error: insertError } = await supabase
    .from('employee_shifts')
    .insert({
      salon_id: salonId,
      employee_id: employeeId,
      shift_template_id: shiftTemplateId ?? null,
      date,
      start_time: startTime,
      end_time: endTime,
      notes: notes ?? null,
    })
    .select(`
      id,
      salon_id,
      employee_id,
      shift_template_id,
      date,
      start_time,
      end_time,
      notes,
      created_at,
      shift_templates (
        name,
        color
      )
    `)
    .single()

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      throw new ConflictError('Pracownik ma juz zmiane w tym dniu')
    }
    throw insertError
  }

  const shiftRow = insertedShift as EmployeeShiftWithTemplateRow
  const shift: EmployeeShift = {
    id: shiftRow.id,
    salon_id: shiftRow.salon_id,
    employee_id: shiftRow.employee_id,
    shift_template_id: shiftRow.shift_template_id,
    date: shiftRow.date,
    start_time: shiftRow.start_time,
    end_time: shiftRow.end_time,
    notes: shiftRow.notes,
    created_at: shiftRow.created_at,
    template: shiftRow.shift_templates
      ? {
          name: shiftRow.shift_templates.name,
          color: shiftRow.shift_templates.color,
        }
      : null,
  }

  return NextResponse.json({ shift }, { status: 201 })
})
