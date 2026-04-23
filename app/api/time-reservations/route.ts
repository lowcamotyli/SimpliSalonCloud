import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { addDaysToIsoDate, resolveSalonTimeZone, zonedDateTimeToUtcIso } from '@/lib/utils/timezone'
import type { Tables, TablesInsert } from '@/types/supabase'

type TimeReservationRow = Tables<'time_reservations'>
type TimeReservationInsert = TablesInsert<'time_reservations'>

interface AccessScope {
  role: string | null
  employeeId: string | null
  canManageAll: boolean
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function dayRangeUtcForSalon(date: string, timeZone: string): { start: string; end: string } {
  return {
    start: zonedDateTimeToUtcIso(date, '00:00', timeZone),
    end: zonedDateTimeToUtcIso(addDaysToIsoDate(date, 1), '00:00', timeZone),
  }
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

function parseReservationBounds(
  body: Record<string, unknown>,
  timeZone: string
): { startAtIso: string; endAtIso: string } {
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const startTime = typeof body.start_time === 'string' ? body.start_time.trim() : ''
  const endTime = typeof body.end_time === 'string' ? body.end_time.trim() : ''

  if (date && startTime && endTime) {
    return {
      startAtIso: zonedDateTimeToUtcIso(date, startTime, timeZone),
      endAtIso: zonedDateTimeToUtcIso(date, endTime, timeZone),
    }
  }

  const startAt = parseIsoDate(body.start_at, 'start_at')
  const endAt = parseIsoDate(body.end_at, 'end_at')

  return {
    startAtIso: startAt.toISOString(),
    endAtIso: endAt.toISOString(),
  }
}

export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, user, salonId } = await getAuthContext()
  const salonTimeZone = await getSalonTimeZone(supabase, salonId)
  const access = await resolveAccessScope(supabase, salonId, user.id)

  const { searchParams } = new URL(request.url)
  const employeeIdParam = searchParams.get('employeeId')
  const dateParam = searchParams.get('date')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  if (dateParam && !isValidDateString(dateParam)) {
    throw new ValidationError('date must be YYYY-MM-DD')
  }
  if (fromParam && !isValidDateString(fromParam)) {
    throw new ValidationError('from must be YYYY-MM-DD')
  }
  if (toParam && !isValidDateString(toParam)) {
    throw new ValidationError('to must be YYYY-MM-DD')
  }

  let query = supabase
    .from('time_reservations')
    .select('*')
    .eq('salon_id', salonId)
    .order('start_at', { ascending: true })

  if (access.canManageAll) {
    if (employeeIdParam) {
      query = query.eq('employee_id', employeeIdParam)
    }
  } else {
    if (!access.employeeId) {
      throw new ForbiddenError('Employee account is not linked to an employee record')
    }
    if (employeeIdParam && employeeIdParam !== access.employeeId) {
      throw new ForbiddenError('Employees can only access their own time reservations')
    }
    query = query.eq('employee_id', access.employeeId)
  }

  if (dateParam) {
    const range = dayRangeUtcForSalon(dateParam, salonTimeZone)
    query = query.lt('start_at', range.end).gt('end_at', range.start)
  } else {
    let rangeStart: string | null = null
    let rangeEnd: string | null = null

    if (fromParam) {
      rangeStart = dayRangeUtcForSalon(fromParam, salonTimeZone).start
    }
    if (toParam) {
      rangeEnd = dayRangeUtcForSalon(toParam, salonTimeZone).end
    }

    if (rangeStart && rangeEnd) {
      query = query.lt('start_at', rangeEnd).gt('end_at', rangeStart)
    } else if (rangeStart) {
      query = query.gte('start_at', rangeStart)
    } else if (rangeEnd) {
      query = query.lt('start_at', rangeEnd)
    }
  }

  const { data, error } = await query
  if (error) throw error

  return NextResponse.json({ reservations: (data ?? []) as TimeReservationRow[] })
})

export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, user, salonId } = await getAuthContext()
  const salonTimeZone = await getSalonTimeZone(supabase, salonId)
  const access = await resolveAccessScope(supabase, salonId, user.id)
  const body = (await request.json()) as Record<string, unknown>

  const employeeId = typeof body.employee_id === 'string' ? body.employee_id.trim() : ''
  if (!employeeId) {
    throw new ValidationError('employee_id is required')
  }

  const { startAtIso, endAtIso } = parseReservationBounds(body, salonTimeZone)
  const startAt = new Date(startAtIso)
  const endAt = new Date(endAtIso)
  if (startAt >= endAt) {
    return NextResponse.json({ error: 'start_at must be before end_at' }, { status: 400 })
  }

  if (!access.canManageAll) {
    if (!access.employeeId || access.employeeId !== employeeId) {
      throw new ForbiddenError('Employees can only create their own time reservations')
    }
  }

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .maybeSingle()

  if (employeeError) throw employeeError
  if (!employee) throw new ValidationError('employee_id does not belong to this salon')

  const { data: overlap, error: overlapError } = await supabase
    .from('time_reservations')
    .select('id')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .lt('start_at', endAtIso)
    .gt('end_at', startAtIso)
    .maybeSingle()

  if (overlapError) throw overlapError
  if (overlap) {
    throw new ValidationError('time reservation overlaps with an existing reservation')
  }

  const titleInput = body.title
  const title =
    titleInput === undefined || titleInput === null
      ? null
      : typeof titleInput === 'string'
        ? titleInput
        : (() => {
            throw new ValidationError('title must be a string')
          })()

  const payload: TimeReservationInsert = {
    salon_id: salonId,
    created_by: user.id,
    employee_id: employeeId,
    start_at: startAtIso,
    end_at: endAtIso,
    title,
  }

  const { data, error } = await supabase
    .from('time_reservations')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json({ reservation: data as TimeReservationRow }, { status: 201 })
})
