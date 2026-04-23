import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type RouteContext = {
  params: Promise<{ id: string }>
}

type EmployeeServiceAssignmentRow = {
  service_id: string | null
}

type BulkAction = 'set' | 'add' | 'remove'

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

async function ensureServiceExists(
  serviceId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<void> {
  const { data: service, error } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  if (!service) throw new ValidationError(`Invalid service_id: ${serviceId}`)
}

function parseAction(value: unknown): BulkAction {
  if (value === 'set' || value === 'add' || value === 'remove') {
    return value
  }

  throw new ValidationError('action must be one of: set, add, remove')
}

function parseServiceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('service_ids must be an array of strings')
  }

  const parsed: string[] = []

  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string') {
      throw new ValidationError(`service_ids[${index}] must be a string`)
    }

    const trimmed = item.trim()
    if (!trimmed) {
      throw new ValidationError(`service_ids[${index}] cannot be empty`)
    }

    parsed.push(trimmed)
  }

  return [...new Set(parsed)]
}

async function getAssignedServiceIds(
  employeeId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
): Promise<string[]> {
  const { data, error } = await supabase
    .from('employee_services')
    .select('service_id')
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)

  if (error) throw error

  return ((data ?? []) as EmployeeServiceAssignmentRow[])
    .map((row) => row.service_id)
    .filter((serviceId): serviceId is string => typeof serviceId === 'string')
}

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(id, salonId, supabase)

  const body = await request.json()
  const action = parseAction(body?.action)
  const serviceIds = parseServiceIds(body?.service_ids)

  for (const serviceId of serviceIds) {
    await ensureServiceExists(serviceId, salonId, supabase)
  }

  if (action === 'set') {
    const { error: deleteError } = await supabase
      .from('employee_services')
      .delete()
      .eq('salon_id', salonId)
      .eq('employee_id', id)

    if (deleteError) throw deleteError

    if (serviceIds.length > 0) {
      const { error: insertError } = await supabase
        .from('employee_services')
        .insert(
          serviceIds.map((serviceId) => ({
            salon_id: salonId,
            employee_id: id,
            service_id: serviceId,
          }))
        )

      if (insertError) throw insertError
    }
  }

  if (action === 'add' && serviceIds.length > 0) {
    const currentServiceIds = await getAssignedServiceIds(id, salonId, supabase)
    const currentServiceIdSet = new Set(currentServiceIds)

    const rowsToInsert = serviceIds
      .filter((serviceId) => !currentServiceIdSet.has(serviceId))
      .map((serviceId) => ({
        salon_id: salonId,
        employee_id: id,
        service_id: serviceId,
      }))

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('employee_services')
        .insert(rowsToInsert)

      if (insertError) throw insertError
    }
  }

  if (action === 'remove' && serviceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('employee_services')
      .delete()
      .eq('salon_id', salonId)
      .eq('employee_id', id)
      .in('service_id', serviceIds)

    if (deleteError) throw deleteError
  }

  const finalServiceIds = await getAssignedServiceIds(id, salonId, supabase)

  return NextResponse.json({
    success: true,
    service_ids: finalServiceIds,
  })
})
