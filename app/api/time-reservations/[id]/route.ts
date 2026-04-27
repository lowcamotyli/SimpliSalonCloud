import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { resolveSalonTimeZone, zonedDateTimeToUtcIso } from '@/lib/utils/timezone'
import type { Tables, TablesUpdate } from '@/types/supabase'

type TimeReservationRow = Tables<'time_reservations'>
type TimeReservationUpdate = TablesUpdate<'time_reservations'>

interface AccessScope {
  role: string | null
  employeeId: string | null
  canManageAll: boolean
}

async function resolveAccessScope(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string,
  userId: string
): Promise<AccessScope> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('salon_id', salonId)
    .eq('user_id', userId)
    .maybeSingle()

  if (profileError) throw profileError

  const role = profile?.role ?? null
  const canManageAll = role === 'owner' || role === 'manager'

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id')
    .eq('salon_id', salonId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (employeeError) throw employeeError

  return {
    role,
    employeeId: employee?.id ?? null,
    canManageAll,
  }
}

function parseIsoDate(value: unknown, fieldName: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty ISO datetime string`)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO datetime string`)
  }

  return parsed
}

async function getSalonTimeZone(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('salon_settings')
    .select('timezone')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  return resolveSalonTimeZone(data?.timezone ?? null)
}

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, user, salonId } = await getAuthContext()
  const salonTimeZone = await getSalonTimeZone(supabase, salonId)
  const access = await resolveAccessScope(supabase, salonId, user.id)
  const body = (await request.json()) as Record<string, unknown>

  let startAtIso: string | null = null
  let endAtIso: string | null = null

  const updatePayload: TimeReservationUpdate = {}

  const hasLocalContract = body.date !== undefined || body.start_time !== undefined || body.end_time !== undefined
  if (hasLocalContract) {
    if (typeof body.date !== 'string' || typeof body.start_time !== 'string' || typeof body.end_time !== 'string') {
      throw new ValidationError('date, start_time and end_time must be strings when using local contract')
    }
    startAtIso = zonedDateTimeToUtcIso(body.date.trim(), body.start_time.trim(), salonTimeZone)
    endAtIso = zonedDateTimeToUtcIso(body.date.trim(), body.end_time.trim(), salonTimeZone)
    updatePayload.start_at = startAtIso
    updatePayload.end_at = endAtIso
  } else {
    if (body.start_at !== undefined) {
      const startAt = parseIsoDate(body.start_at, 'start_at')
      startAtIso = startAt.toISOString()
      updatePayload.start_at = startAtIso
    }
    if (body.end_at !== undefined) {
      const endAt = parseIsoDate(body.end_at, 'end_at')
      endAtIso = endAt.toISOString()
      updatePayload.end_at = endAtIso
    }
  }
  if (body.title !== undefined) {
    if (body.title !== null && typeof body.title !== 'string') {
      throw new ValidationError('title must be a string or null')
    }
    updatePayload.title = body.title
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new ValidationError('No valid fields to update')
  }

  const { data: existingReservation, error: existingError } = await supabase
    .from('time_reservations')
    .select('id, employee_id, start_at, end_at')
    .eq('id', id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existingReservation) throw new NotFoundError('TimeReservation', id)

  if (!access.canManageAll && access.employeeId !== existingReservation.employee_id) {
    throw new NotFoundError('TimeReservation', id)
  }

  const finalStart = startAtIso ?? existingReservation.start_at
  const finalEnd = endAtIso ?? existingReservation.end_at
  if (new Date(finalStart) >= new Date(finalEnd)) {
    throw new ValidationError('start_at must be before end_at')
  }

  const { data: overlap, error: overlapError } = await supabase
    .from('time_reservations')
    .select('id')
    .eq('salon_id', salonId)
    .eq('employee_id', existingReservation.employee_id)
    .neq('id', id)
    .lt('start_at', finalEnd)
    .gt('end_at', finalStart)
    .maybeSingle()

  if (overlapError) throw overlapError
  if (overlap) {
    throw new ValidationError('time reservation overlaps with an existing reservation')
  }

  let query = supabase
    .from('time_reservations')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)

  if (!access.canManageAll) {
    if (!access.employeeId) {
      throw new ForbiddenError('Employee account is not linked to an employee record')
    }
    query = query.eq('employee_id', access.employeeId)
  }

  const { data, error } = await query
    .select('*')
    .single()
  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('TimeReservation', id)
    throw error
  }

  return NextResponse.json({ reservation: data as TimeReservationRow })
})

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, user, salonId } = await getAuthContext()
  const access = await resolveAccessScope(supabase, salonId, user.id)

  let query = supabase
    .from('time_reservations')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (!access.canManageAll) {
    if (!access.employeeId) {
      throw new ForbiddenError('Employee account is not linked to an employee record')
    }
    query = query.eq('employee_id', access.employeeId)
  }

  const { data, error } = await query
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('TimeReservation', id)

  return new NextResponse(null, { status: 204 })
})
