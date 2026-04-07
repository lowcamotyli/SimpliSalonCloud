import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type RouteContext = {
  params: Promise<{ id: string; shiftId: string }>
}

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> => {
  const { id: employeeId, shiftId } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: shift, error: shiftError } = await supabase
    .from('employee_shifts')
    .select('id')
    .eq('id', shiftId)
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)
    .maybeSingle()

  if (shiftError) throw shiftError
  if (!shift) throw new NotFoundError('Employee shift', shiftId)

  const { error: deleteError } = await supabase
    .from('employee_shifts')
    .delete()
    .eq('id', shiftId)
    .eq('salon_id', salonId)
    .eq('employee_id', employeeId)

  if (deleteError) throw deleteError

  return NextResponse.json({ success: true })
})
