import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createClient } from '@/lib/supabase/server'

const SERVICE_MEDIA_BUCKET = 'service-media'
const MAX_MEDIA_COUNT = 5
const MAX_FILE_SIZE = 2_097_152
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

function getExtensionFromMimeType(fileType: string): 'jpeg' | 'png' | 'webp' | null {
  switch (fileType) {
    case 'image/jpeg':
      return 'jpeg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return null
  }
}

// GET /api/services/[id]/media
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: serviceId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_media')
    .select('*')
    .eq('service_id', serviceId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw error
  }

  return NextResponse.json(data ?? [])
})

// POST /api/services/[id]/media
export const POST = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: serviceId } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (serviceError) {
    throw serviceError
  }

  if (!service) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { count, error: countError } = await supabase
    .from('service_media')
    .select('*', { count: 'exact', head: true })
    .eq('service_id', serviceId)

  if (countError) {
    throw countError
  }

  const currentCount = count ?? 0
  if (currentCount >= MAX_MEDIA_COUNT) {
    return NextResponse.json({ error: 'max_photos_reached' }, { status: 422 })
  }

  const formData = await request.formData()
  const file = (formData.get('image') ?? formData.get('file')) as File | null

  if (!file || file.size > MAX_FILE_SIZE || !ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    return NextResponse.json({ error: 'invalid_file' }, { status: 422 })
  }

  const ext = getExtensionFromMimeType(file.type)
  if (!ext) {
    return NextResponse.json({ error: 'invalid_file' }, { status: 422 })
  }

  const path = `${salonId}/${serviceId}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) {
    throw uploadError
  }

  const publicUrl = supabase.storage
    .from(SERVICE_MEDIA_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl

  const { data: media, error: insertError } = await supabase
    .from('service_media')
    .insert({
      salon_id: salonId,
      service_id: serviceId,
      storage_path: path,
      public_url: publicUrl,
      sort_order: currentCount,
    })
    .select('id, public_url, sort_order')
    .single()

  if (insertError) {
    await supabase.storage.from(SERVICE_MEDIA_BUCKET).remove([path])
    throw insertError
  }

  return NextResponse.json(media, { status: 201 })
})
