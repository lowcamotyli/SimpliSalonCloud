import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()
  const { id: serviceId, mediaId } = await params

  const { data: media, error: mediaError } = await supabase
    .from('service_media')
    .select('id, storage_path')
    .eq('id', mediaId)
    .eq('service_id', serviceId)
    .eq('salon_id', salonId)
    .single()

  if (mediaError || !media) {
    throw new NotFoundError('Service media', mediaId)
  }

  const { error: storageError } = await supabase.storage
    .from('service-media')
    .remove([media.storage_path])

  if (storageError) {
    throw storageError
  }

  const { error: deleteError } = await supabase
    .from('service_media')
    .delete()
    .eq('id', mediaId)
    .eq('service_id', serviceId)
    .eq('salon_id', salonId)

  if (deleteError) {
    throw deleteError
  }

  const { data: remainingMedia, error: remainingError } = await supabase
    .from('service_media')
    .select('id')
    .eq('service_id', serviceId)
    .eq('salon_id', salonId)
    .order('sort_order', { ascending: true })

  if (remainingError) {
    throw remainingError
  }

  const items = remainingMedia ?? []

  for (const [index, item] of items.entries()) {
    const { error: updateError } = await supabase
      .from('service_media')
      .update({ sort_order: index })
      .eq('id', item.id)
      .eq('service_id', serviceId)
      .eq('salon_id', salonId)

    if (updateError) {
      throw updateError
    }
  }

  return new NextResponse(null, { status: 204 })
})
