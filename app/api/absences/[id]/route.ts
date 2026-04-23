import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Tables, TablesUpdate } from '@/types/supabase'

type Absence = Tables<'employee_absences'>
type AbsenceUpdate = TablesUpdate<'employee_absences'>

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

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, user, salonId } = await getAuthContext()
  const { role, employeeId: currentEmployeeId } = await getAccessContext(user.id, salonId)

  const { data: existingAbsence, error: existingError } = await supabase
    .from('employee_absences')
    .select('*')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError) {
    if (existingError.code === 'PGRST116') {
      throw new NotFoundError('EmployeeAbsence', id)
    }
    throw existingError
  }

  if (role === 'employee') {
    if (!currentEmployeeId) {
      throw new NotFoundError('Employee')
    }
    if (existingAbsence.employee_id !== currentEmployeeId) {
      throw new NotFoundError('EmployeeAbsence', id)
    }
  } else if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Unsupported role')
  }

  const body = await request.json()
  const updatePayload: AbsenceUpdate = {}

  if (body?.start_date !== undefined) {
    if (typeof body.start_date !== 'string') {
      throw new ValidationError('start_date must be a string')
    }
    updatePayload.start_date = body.start_date
  }

  if (body?.end_date !== undefined) {
    if (typeof body.end_date !== 'string') {
      throw new ValidationError('end_date must be a string')
    }
    updatePayload.end_date = body.end_date
  }

  if (body?.reason !== undefined) {
    updatePayload.reason = parseOptionalReason(body.reason)
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No valid fields to update')
  }

  validateDateRange(
    updatePayload.start_date ?? existingAbsence.start_date,
    updatePayload.end_date ?? existingAbsence.end_date
  )

  const { data: absence, error } = await supabase
    .from('employee_absences')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('EmployeeAbsence', id)
    }
    throw error
  }

  return NextResponse.json({ absence: absence as Absence })
})

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, user, salonId } = await getAuthContext()
  const { role, employeeId: currentEmployeeId } = await getAccessContext(user.id, salonId)

  const { data: existingAbsence, error: existingError } = await supabase
    .from('employee_absences')
    .select('id, employee_id')
    .eq('id', id)
    .eq('salon_id', salonId)
    .single()

  if (existingError) {
    if (existingError.code === 'PGRST116') {
      throw new NotFoundError('EmployeeAbsence', id)
    }
    throw existingError
  }

  if (role === 'employee') {
    if (!currentEmployeeId) {
      throw new NotFoundError('Employee')
    }
    if (existingAbsence.employee_id !== currentEmployeeId) {
      throw new NotFoundError('EmployeeAbsence', id)
    }
  } else if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Unsupported role')
  }

  const { error } = await supabase
    .from('employee_absences')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (error) throw error

  return new NextResponse(null, { status: 204 })
})
