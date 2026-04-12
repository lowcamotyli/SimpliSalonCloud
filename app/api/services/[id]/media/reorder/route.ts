import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

interface ReorderRequestBody {
  order: string[]
}

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()
  const { id: serviceId } = await params
  const body = (await request.json()) as ReorderRequestBody
  const order = body.order

  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Invalid order payload' }, { status: 422 })
  }

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .single()

  if (serviceError || !service) {
    throw new NotFoundError('Service', serviceId)
  }

  const { data: mediaRecords, error: mediaError } = await supabase
    .from('service_media')
    .select('id')
    .eq('service_id', serviceId)
    .eq('salon_id', salonId)

  if (mediaError) {
    throw mediaError
  }

  const existingIds = new Set((mediaRecords ?? []).map((record) => record.id))
  const orderIds = new Set(order)

  const hasMismatch =
    order.length !== existingIds.size ||
    orderIds.size !== existingIds.size ||
    [...orderIds].some((id) => !existingIds.has(id))

  if (hasMismatch) {
    return NextResponse.json({ error: 'Order payload does not match service media' }, { status: 422 })
  }

  for (const [index, mediaId] of order.entries()) {
    const { error: updateError } = await supabase
      .from('service_media')
      .update({ sort_order: index })
      .eq('id', mediaId)
      .eq('service_id', serviceId)
      .eq('salon_id', salonId)

    if (updateError) {
      throw updateError
    }
  }

  return NextResponse.json({ success: true })
})
