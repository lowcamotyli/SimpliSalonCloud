import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type GroupStatus = 'completed' | 'cancelled' | 'no_show'

interface PatchBody {
  status: GroupStatus
  paymentMethod?: string
  surcharge?: number
}

const VALID_STATUSES: GroupStatus[] = ['completed', 'cancelled', 'no_show']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const { supabase, salonId: authSalonId } = await getAuthContext()
    const body = (await request.json()) as Partial<PatchBody>

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: existingVisitGroup, error: visitGroupError } = await supabase
      .from('visit_groups')
      .select('*')
      .eq('id', groupId)
      .eq('salon_id', authSalonId)
      .single()

    if (visitGroupError || !existingVisitGroup) {
      return NextResponse.json({ error: 'Visit group not found' }, { status: 404 })
    }

    const shouldRegisterNoShow =
      body.status === 'no_show' &&
      existingVisitGroup.status !== 'no_show' &&
      !!existingVisitGroup.client_id

    const visitGroupUpdate: { status: GroupStatus; payment_method?: string; surcharge?: number } = {
      status: body.status,
    }

    if (body.paymentMethod !== undefined) {
      visitGroupUpdate.payment_method = body.paymentMethod
    }

    if (body.surcharge !== undefined) {
      visitGroupUpdate.surcharge = body.surcharge
    }

    const { data: visitGroup, error: updateVisitGroupError } = await supabase
      .from('visit_groups')
      .update(visitGroupUpdate)
      .eq('id', groupId)
      .eq('salon_id', authSalonId)
      .select('*')
      .single()

    if (updateVisitGroupError || !visitGroup) {
      return NextResponse.json({ error: 'Failed to update visit group' }, { status: 500 })
    }

    const { data: bookings, error: updateBookingsError } = await supabase
      .from('bookings')
      .update({ status: body.status })
      .eq('visit_group_id', groupId)
      .eq('salon_id', authSalonId)
      .select('*')

    if (updateBookingsError) {
      return NextResponse.json({ error: 'Failed to update bookings' }, { status: 500 })
    }

    if (shouldRegisterNoShow && existingVisitGroup.client_id) {
      const { error: violationError } = await (supabase as any).from('client_violations').insert({
        client_id: existingVisitGroup.client_id,
        booking_id: null,
        violation_type: 'no_show',
        occurred_at: new Date().toISOString(),
      })

      if (violationError) {
        return NextResponse.json({ error: 'Failed to register no-show violation' }, { status: 500 })
      }

      const { error: noShowError } = await (supabase as any).rpc('increment_client_no_show', {
        p_client_id: existingVisitGroup.client_id,
      })

      if (noShowError) {
        return NextResponse.json({ error: 'Failed to update client no-show count' }, { status: 500 })
      }
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
