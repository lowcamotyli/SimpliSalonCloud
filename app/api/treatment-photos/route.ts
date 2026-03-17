import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { hasFeature } from '@/lib/features'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/supabase'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type TreatmentPhotoInsert = TablesInsert<'treatment_photos'>
type PhotoType = 'before' | 'after' | 'during' | 'other'

const TREATMENT_PHOTOS_BUCKET = 'treatment-photos'
const SIGNED_URL_TTL_SECONDS = 3600
const ALLOWED_PHOTO_TYPES: PhotoType[] = ['before', 'after', 'during', 'other']

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

async function getTreatmentRecord(
  supabase: SupabaseClient,
  treatmentRecordId: string,
  salonId: string
) {
  const { data: record, error } = await supabase
    .from('treatment_records')
    .select('id, client_id, salon_id')
    .eq('id', treatmentRecordId)
    .eq('salon_id', salonId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('TreatmentRecord', treatmentRecordId)
    }
    throw error
  }

  return record
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
    throw new ForbiddenError('Only owner or manager can upload treatment photos')
  }
}

function parsePhotoType(value: FormDataEntryValue | null): PhotoType {
  if (typeof value !== 'string' || !ALLOWED_PHOTO_TYPES.includes(value as PhotoType)) {
    throw new ValidationError(`photo_type must be one of: ${ALLOWED_PHOTO_TYPES.join(', ')}`)
  }

  return value as PhotoType
}

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required`)
  }

  return value.trim()
}

function getFileExtension(file: File) {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase()

  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName
  }

  switch (file.type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      throw new ValidationError('Unsupported file type')
  }
}

// GET /api/treatment-photos?treatment_record_id=uuid - list signed treatment photos
export const GET = withErrorHandling(async (request: NextRequest) => {
  const treatmentRecordId = request.nextUrl.searchParams.get('treatment_record_id')
  if (!treatmentRecordId) {
    throw new ValidationError('treatment_record_id is required')
  }

  const [{ salonId }, supabase] = await Promise.all([
    getAuthContext(),
    createServerSupabaseClient(),
  ])

  const featureResponse = await ensureTreatmentPhotosFeatureEnabled(supabase, salonId)
  if (featureResponse) return featureResponse

  const { data: photos, error } = await supabase
    .from('treatment_photos')
    .select('id, storage_path, photo_type, taken_at, notes, created_at, treatment_record_id, client_id')
    .eq('treatment_record_id', treatmentRecordId)
    .eq('salon_id', salonId)
    .order('taken_at', { ascending: false })

  if (error) throw error

  const photosWithSignedUrls = await Promise.all(
    (photos ?? []).map(async (photo) => ({
      ...photo,
      signed_url: await createSignedUrl(supabase, photo.storage_path),
    }))
  )

  return NextResponse.json(photosWithSignedUrls)
})

// POST /api/treatment-photos - upload treatment photo
export const POST = withErrorHandling(async (request: NextRequest) => {
  const [{ salonId, user }, supabase] = await Promise.all([
    getAuthContext(),
    createServerSupabaseClient(),
  ])

  const featureResponse = await ensureTreatmentPhotosFeatureEnabled(supabase, salonId)
  if (featureResponse) return featureResponse
  await requireOwnerOrManagerRole(supabase)

  const formData = await request.formData()
  const treatmentRecordId = parseRequiredString(formData.get('treatment_record_id'), 'treatment_record_id')
  const photoType = parsePhotoType(formData.get('photo_type'))
  const notesEntry = formData.get('notes')
  const fileEntry = formData.get('file')

  if (!(fileEntry instanceof File)) {
    throw new ValidationError('file is required')
  }

  if (fileEntry.size === 0) {
    throw new ValidationError('file must not be empty')
  }

  const notes = typeof notesEntry === 'string' && notesEntry.trim().length > 0
    ? notesEntry.trim()
    : null

  const record = await getTreatmentRecord(supabase, treatmentRecordId, salonId)

  const { data: consentForm, error: consentError } = await supabase
    .from('client_forms')
    .select('id, health_consent_at, form_template:form_templates!inner(salon_id)')
    .eq('client_id', record.client_id)
    .eq('form_template.salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (consentError) throw consentError

  if (!consentForm?.health_consent_at) {
    return NextResponse.json({ error: 'Health consent required' }, { status: 422 })
  }

  const extension = getFileExtension(fileEntry)
  const storagePath = `${salonId}/${record.id}/${randomUUID()}.${extension}`
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer())

  const { error: uploadError } = await supabase
    .storage
    .from(TREATMENT_PHOTOS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: fileEntry.type || undefined,
      upsert: false,
    })

  if (uploadError) throw uploadError

  const insertPayload: TreatmentPhotoInsert = {
    client_id: record.client_id,
    created_by: user.id,
    notes,
    photo_type: photoType,
    salon_id: salonId,
    storage_path: storagePath,
    treatment_record_id: record.id,
  }

  const { data: photo, error: insertError } = await supabase
    .from('treatment_photos')
    .insert(insertPayload)
    .select('id, storage_path, photo_type, taken_at')
    .single()

  if (insertError) {
    await supabase.storage.from(TREATMENT_PHOTOS_BUCKET).remove([storagePath])
    throw insertError
  }

  return NextResponse.json({
    ...photo,
    signed_url: await createSignedUrl(supabase, photo.storage_path),
  })
})
