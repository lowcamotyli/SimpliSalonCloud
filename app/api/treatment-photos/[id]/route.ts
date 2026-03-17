import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const TREATMENT_PHOTOS_BUCKET = 'treatment-photos'
const SIGNED_URL_TTL_SECONDS = 3600

async function ensureTreatmentPhotosFeatureEnabled(
  supabase: SupabaseClient,
  salonId: string
) {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('features')
    .eq('id', salonId)
    .single()

  if (error) throw error

  if (!hasFeature((salon as { features: Record<string, boolean> | null } | null)?.features, 'treatment_photos')) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 402 })
  }

  return null
}

async function getTreatmentPhoto(
  supabase: SupabaseClient,
  photoId: string,
  salonId: string
) {
  const { data: photo, error } = await supabase
    .from('treatment_photos')
    .select('id, storage_path, photo_type, taken_at, notes, created_at, treatment_record_id, client_id')
    .eq('id', photoId)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('TreatmentPhoto', photoId)
    }
    throw error
  }

  return photo
}

async function createSignedUrl(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase
    .storage
    .from(TREATMENT_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error) throw error

  return data.signedUrl
}

async function requireOwnerOrManagerRole(supabase: SupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError

  const role = user?.app_metadata?.role
  if (role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Only owner or manager can delete treatment photos')
  }

  const { data, error } = await supabase.rpc('has_any_salon_role', {
    required_roles: ['owner', 'manager'],
  })

  if (error) throw error
  if (!data) {
    throw new ForbiddenError('Only owner or manager can delete treatment photos')
  }
}

// GET /api/treatment-photos/[id] - get single treatment photo with signed URL
export const GET = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const [{ salonId }, supabase] = await Promise.all([
    getAuthContext(),
    createServerSupabaseClient(),
  ])

  const featureResponse = await ensureTreatmentPhotosFeatureEnabled(supabase, salonId)
  if (featureResponse) return featureResponse

  const photo = await getTreatmentPhoto(supabase, id, salonId)

  return NextResponse.json({
    ...photo,
    signed_url: await createSignedUrl(supabase, photo.storage_path),
  })
})

// DELETE /api/treatment-photos/[id] - hard delete treatment photo and storage object
export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const [{ salonId }, supabase] = await Promise.all([
    getAuthContext(),
    createServerSupabaseClient(),
  ])

  const featureResponse = await ensureTreatmentPhotosFeatureEnabled(supabase, salonId)
  if (featureResponse) return featureResponse

  await requireOwnerOrManagerRole(supabase)

  const photo = await getTreatmentPhoto(supabase, id, salonId)

  const { error: storageError } = await supabase
    .storage
    .from(TREATMENT_PHOTOS_BUCKET)
    .remove([photo.storage_path])

  if (storageError) throw storageError

  const { error: deleteError } = await supabase
    .from('treatment_photos')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)

  if (deleteError) throw deleteError

  return new NextResponse(null, { status: 204 })
})
