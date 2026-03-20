import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type GroupStatus = 'completed' | 'cancelled' | 'no_show'

interface PatchBody {
  status: GroupStatus
  paymentMethod?: string
}

const VALID_STATUSES: GroupStatus[] = ['completed', 'cancelled', 'no_show']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, salonId: authSalonId } = await getAuthContext()
    const body = (await request.json()) as Partial<PatchBody>

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: existingVisitGroup, error: visitGroupError } = await supabase
      .from('visit_groups')
      .select('*')
      .eq('id', id)
      .single()

    if (visitGroupError || !existingVisitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 })
    }

    if (existingVisitGroup.salon_id !== authSalonId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const groupStatus = body.status === 'completed' ? 'completed' : 'cancelled'
    const visitGroupUpdate: { status: 'completed' | 'cancelled'; payment_method?: string } = {
      status: groupStatus,
    }

    if (body.paymentMethod !== undefined) {
      visitGroupUpdate.payment_method = body.paymentMethod
    }

    const { data: visitGroup, error: updateVisitGroupError } = await supabase
      .from('visit_groups')
      .update(visitGroupUpdate)
      .eq('id', id)
      .eq('salon_id', authSalonId)
      .select('*')
      .single()

    if (updateVisitGroupError || !visitGroup) {
      return NextResponse.json({ error: 'Failed to update visit group' }, { status: 500 })
    }

    const { data: bookings, error: updateBookingsError } = await supabase
      .from('bookings')
      .update({ status: body.status })
      .eq('visit_group_id', id)
      .eq('salon_id', authSalonId)
      .select('*')

    if (updateBookingsError) {
      return NextResponse.json({ error: 'Failed to update bookings' }, { status: 500 })
    }

    return NextResponse.json({ visitGroup, bookings: bookings ?? [] })
  } catch (error: unknown) {
    const err = error as { name?: string }

    if (err.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (err.name === 'NotFoundError') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    console.error('Unexpected error updating visit group:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
