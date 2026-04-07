import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type RouteContext = {
  params: Promise<{ id: string }>
}

type EmployeeServiceRow = {
  services: {
    id: string
    name: string
    duration: number
    price: number
    category: string
    subcategory: string
    active: boolean
    surcharge_allowed: boolean
  } | null
}

async function ensureEmployeeExists(
  employeeId: string,
  salonId: string,
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
) {
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
) {
  const { data: service, error } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) throw error
  if (!service) throw new NotFoundError('Service', serviceId)
}

export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: RouteContext
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(id, salonId, supabase)

  const { data, error } = await supabase
    .from('employee_services')
    .select(`
      services (
        id,
        name,
        duration,
        price,
        category,
        subcategory,
        active,
        surcharge_allowed
      )
    `)
    .eq('salon_id', salonId)
    .eq('employee_id', id)

  if (error) throw error

  const services = ((data ?? []) as EmployeeServiceRow[])
    .map((row) => row.services)
    .filter((service): service is NonNullable<EmployeeServiceRow['services']> => service !== null)

  return NextResponse.json({ services })
})

export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(id, salonId, supabase)

  const body = await request.json()
  const serviceId = typeof body?.serviceId === 'string' ? body.serviceId.trim() : ''

  if (!serviceId) {
    throw new ValidationError('serviceId is required')
  }

  await ensureServiceExists(serviceId, salonId, supabase)

  const { error } = await supabase
    .from('employee_services')
    .insert({
      salon_id: salonId,
      employee_id: id,
      service_id: serviceId,
    })

  if (error) throw error

  return NextResponse.json({ success: true })
})

export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: RouteContext
) => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  await ensureEmployeeExists(id, salonId, supabase)

  const serviceId = request.nextUrl.searchParams.get('serviceId')?.trim() ?? ''

  if (!serviceId) {
    throw new ValidationError('serviceId is required')
  }

  const { error } = await supabase
    .from('employee_services')
    .delete()
    .eq('salon_id', salonId)
    .eq('employee_id', id)
    .eq('service_id', serviceId)

  if (error) throw error

  return NextResponse.json({ success: true })
})
