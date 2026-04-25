import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Tables, TablesInsert } from '@/types/supabase'

type Absence = Tables<'employee_absences'>
type AbsenceInsert = TablesInsert<'employee_absences'>

type AccessContext = {
  role: string
  employeeId: string | null
}

async function getAccessContext(userId: string, salonId: string): Promise<AccessContext> {
  const adminSupabase = createAdminSupabaseClient()

  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .single()

  if (profileError) {
    if (profileError.code === 'PGRST116') {
      throw new NotFoundError('Profile')
    }
    throw profileError
  }

  const { data: employee, error: employeeError } = await adminSupabase
    .from('employees')
    .select('id')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (employeeError) throw employeeError

  return {
    role: profile.role,
    employeeId: employee?.id ?? null,
  }
}

async function assertEmployeeInSalon(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: string,
  salonId: string
) {
  const { data: employee, error } = await adminSupabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Employee', employeeId)
    }
    throw error
  }

  return employee
}

function parseOptionalReason(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new ValidationError('reason must be a string or null')
  }

  return value
}

function validateDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new ValidationError('start_date must be less than or equal to end_date')
  }
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, user, salonId } = await getAuthContext()
  const { role, employeeId } = await getAccessContext(user.id, salonId)
  const { searchParams } = new URL(request.url)
  const employeeFilter = searchParams.get('employeeId')
  if (employeeFilter && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(employeeFilter)) {
    throw new ValidationError('employeeId must be a valid UUID')
  }

  let query = supabase
    .from('employee_absences')
    .select('*')
    .eq('salon_id', salonId)
    .order('start_date', { ascending: true })

  if (role === 'employee') {
    if (!employeeId) {
      throw new NotFoundError('Employee')
    }
    query = query.eq('employee_id', employeeId)
  } else if (role === 'owner' || role === 'manager') {
    if (employeeFilter) {
      query = query.eq('employee_id', employeeFilter)
    }
  } else {
    throw new ForbiddenError('Unsupported role')
  }

  const { data: absences, error } = await query

  if (error) throw error

  return NextResponse.json({
    absences: (absences ?? []) as Absence[],
  })
})

export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, user, salonId } = await getAuthContext()
  const { role, employeeId: currentEmployeeId } = await getAccessContext(user.id, salonId)
  const adminSupabase = createAdminSupabaseClient()
  const body = await request.json()

  if (!body?.employee_id || typeof body.employee_id !== 'string') {
    throw new ValidationError('employee_id is required')
  }

  if (!body?.start_date || typeof body.start_date !== 'string' || !isValidDateString(body.start_date)) {
    throw new ValidationError('start_date must be a valid YYYY-MM-DD date')
  }

  if (!body?.end_date || typeof body.end_date !== 'string' || !isValidDateString(body.end_date)) {
    throw new ValidationError('end_date must be a valid YYYY-MM-DD date')
  }

  validateDateRange(body.start_date, body.end_date)

  if (role === 'employee') {
    if (!currentEmployeeId) {
      throw new NotFoundError('Employee')
    }
    if (body.employee_id !== currentEmployeeId) {
      throw new ForbiddenError('Employees can only create their own absences')
    }
  } else if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Unsupported role')
  }

  await assertEmployeeInSalon(adminSupabase, body.employee_id, salonId)

  const insertPayload: AbsenceInsert = {
    employee_id: body.employee_id,
    start_date: body.start_date,
    end_date: body.end_date,
    reason: parseOptionalReason(body.reason) ?? null,
    salon_id: salonId,
    created_by: user.id,
  }

  const { data: absence, error } = await supabase
    .from('employee_absences')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json(
    { absence: absence as Absence },
    { status: 201 }
  )
})
