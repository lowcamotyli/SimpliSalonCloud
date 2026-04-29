import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { ObjectType } from '@/components/objects/object-config'

type SearchType = ObjectType

type SearchResult = {
  id: string
  label: string
  meta: string
  type: ObjectType
  avatarUrl?: string
}

type SearchGroup = {
  type: ObjectType
  items: SearchResult[]
}

const TYPE_ORDER: ReadonlyArray<SearchType> = ['client', 'booking', 'worker', 'service', 'salon']
const ALLOWED_TYPES = new Set<SearchType>(TYPE_ORDER)

function escapeForIlike(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function parseTypes(rawTypes: string | null): SearchType[] {
  if (!rawTypes) {
    return [...TYPE_ORDER]
  }

  const parsed = rawTypes
    .split(',')
    .map((typeValue) => typeValue.trim())
    .filter((typeValue) => typeValue.length > 0)

  const selected = new Set<SearchType>()

  for (const [, typeValue] of parsed.entries()) {
    if (!ALLOWED_TYPES.has(typeValue as SearchType)) {
      throw new ValidationError(`Invalid search type: ${typeValue}`)
    }

    selected.add(typeValue as SearchType)
  }

  return TYPE_ORDER.filter((typeName) => selected.has(typeName))
}

function formatClientMeta(email: string | null, phone: string | null): string {
  if (email && phone) return `${email} | ${phone}`
  if (email) return email
  if (phone) return phone
  return ''
}

function formatServiceMeta(duration: number | null, price: number | null): string {
  const durationPart = typeof duration === 'number' ? `${duration} min` : ''
  const pricePart = typeof price === 'number' ? `${price} PLN` : ''
  if (durationPart && pricePart) return `${durationPart} | ${pricePart}`
  return durationPart || pricePart
}

function formatBookingMeta(date: string | null, status: string | null): string {
  const datePart = date ?? ''
  const statusPart = status ?? ''
  if (datePart && statusPart) return `${datePart} | ${statusPart}`
  return datePart || statusPart
}

async function searchClients(params: {
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
  salonId: string
  escapedQuery: string
}): Promise<SearchResult[]> {
  const { supabase, salonId, escapedQuery } = params
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, email, phone')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .or(`full_name.ilike.%${escapedQuery}%,email.ilike.%${escapedQuery}%,phone.ilike.%${escapedQuery}%`)
    .order('full_name')
    .limit(5)

  if (error) throw error

  const items: SearchResult[] = []
  for (const [, row] of (data ?? []).entries()) {
    items.push({
      id: String((row as { id: string }).id),
      label: ((row as { full_name?: string | null }).full_name ?? '').trim(),
      meta: formatClientMeta(
        (row as { email?: string | null }).email ?? null,
        (row as { phone?: string | null }).phone ?? null
      ),
      type: 'client',
    })
  }

  return items
}

async function searchWorkers(params: {
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
  salonId: string
  escapedQuery: string
}): Promise<SearchResult[]> {
  const { supabase, salonId, escapedQuery } = params
  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, avatar_url, user_id')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .or(`first_name.ilike.%${escapedQuery}%,last_name.ilike.%${escapedQuery}%`)
    .order('first_name')
    .limit(5)

  if (error) throw error

  const userIds: string[] = []
  for (const [, row] of (data ?? []).entries()) {
    const userId = (row as { user_id?: string | null }).user_id
    if (userId) userIds.push(userId)
  }

  let roleByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, role, salon_id')
      .eq('salon_id', salonId)
      .in('user_id', userIds)

    if (profilesError) throw profilesError

    roleByUserId = new Map(
      (profiles ?? []).map((profile) => {
        const typedProfile = profile as { user_id: string; role: string | null }
        return [typedProfile.user_id, typedProfile.role ?? '']
      })
    )
  }

  const items: SearchResult[] = []
  for (const [, row] of (data ?? []).entries()) {
    const firstName = (row as { first_name?: string | null }).first_name ?? ''
    const lastName = (row as { last_name?: string | null }).last_name ?? ''
    const fullName = `${firstName} ${lastName}`.trim()
    const userId = (row as { user_id?: string | null }).user_id ?? null

    items.push({
      id: String((row as { id: string }).id),
      label: fullName,
      meta: userId ? roleByUserId.get(userId) ?? '' : '',
      type: 'worker',
      avatarUrl: (row as { avatar_url?: string | null }).avatar_url ?? undefined,
    })
  }

  return items
}

async function searchServices(params: {
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
  salonId: string
  escapedQuery: string
}): Promise<SearchResult[]> {
  const { supabase, salonId, escapedQuery } = params
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, duration, price')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .or(`name.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%`)
    .order('name')
    .limit(5)

  if (error) throw error

  const items: SearchResult[] = []
  for (const [, row] of (data ?? []).entries()) {
    items.push({
      id: String((row as { id: string }).id),
      label: (row as { name?: string | null }).name ?? '',
      meta: formatServiceMeta(
        (row as { duration?: number | null }).duration ?? null,
        (row as { price?: number | null }).price ?? null
      ),
      type: 'service',
    })
  }

  return items
}

async function searchBookings(params: {
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
  salonId: string
  escapedQuery: string
}): Promise<SearchResult[]> {
  const { supabase, salonId, escapedQuery } = params

  const { data: matchedClients, error: matchedClientsError } = await supabase
    .from('clients')
    .select('id')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .ilike('full_name', `%${escapedQuery}%`)
    .limit(20)

  if (matchedClientsError) throw matchedClientsError

  const clientIds = (matchedClients ?? []).map((row) => (row as { id: string }).id)

  let bookingQuery = supabase
    .from('bookings')
    .select('id, booking_date, status, notes, clients(full_name), services(name)')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false })

  if (clientIds.length > 0) {
    bookingQuery = bookingQuery.or(`notes.ilike.%${escapedQuery}%,client_id.in.(${clientIds.join(',')})`)
  } else {
    bookingQuery = bookingQuery.ilike('notes', `%${escapedQuery}%`)
  }

  const { data, error } = await bookingQuery.limit(5)

  if (error) throw error

  const items: SearchResult[] = []
  for (const [, row] of (data ?? []).entries()) {
    const typedRow = row as {
      id: string
      booking_date?: string | null
      status?: string | null
      clients?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null
      services?: { name?: string | null } | Array<{ name?: string | null }> | null
    }

    const clientData = Array.isArray(typedRow.clients) ? typedRow.clients[0] : typedRow.clients
    const serviceData = Array.isArray(typedRow.services) ? typedRow.services[0] : typedRow.services
    const clientName = clientData?.full_name ?? 'Unknown client'
    const serviceName = serviceData?.name ?? 'Unknown service'

    items.push({
      id: String(typedRow.id),
      label: `${clientName} - ${serviceName}`,
      meta: formatBookingMeta(typedRow.booking_date ?? null, typedRow.status ?? null),
      type: 'booking',
    })
  }

  return items
}

async function searchSalons(params: {
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']
  salonId: string
  escapedQuery: string
}): Promise<SearchResult[]> {
  const { supabase, salonId, escapedQuery } = params
  const { data, error } = await supabase
    .from('salons')
    .select('id, name, slug')
    .eq('id', salonId)
    .is('deleted_at', null)
    .or(`name.ilike.%${escapedQuery}%,slug.ilike.%${escapedQuery}%`)
    .order('name')
    .limit(5)

  if (error) throw error

  const items: SearchResult[] = []
  for (const [, row] of (data ?? []).entries()) {
    items.push({
      id: String((row as { id: string }).id),
      label: (row as { name?: string | null }).name ?? '',
      meta: (row as { slug?: string | null }).slug ?? '',
      type: 'salon',
    })
  }

  return items
}

export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    throw new ValidationError('Query parameter q must be at least 2 characters long')
  }

  const selectedTypes = parseTypes(searchParams.get('types'))
  const escapedQuery = escapeForIlike(q)

  const searchTasks = selectedTypes.map(async (typeName): Promise<[SearchType, SearchResult[]]> => {
    if (typeName === 'client') {
      return ['client', await searchClients({ supabase, salonId, escapedQuery })]
    }

    if (typeName === 'booking') {
      return ['booking', await searchBookings({ supabase, salonId, escapedQuery })]
    }

    if (typeName === 'worker') {
      return ['worker', await searchWorkers({ supabase, salonId, escapedQuery })]
    }

    if (typeName === 'salon') {
      return ['salon', await searchSalons({ supabase, salonId, escapedQuery })]
    }

    return ['service', await searchServices({ supabase, salonId, escapedQuery })]
  })

  const groupsByType = new Map<SearchType, SearchResult[]>(await Promise.all(searchTasks))

  const results: SearchGroup[] = []
  for (const [, typeName] of TYPE_ORDER.entries()) {
    if (!groupsByType.has(typeName)) continue
    results.push({
      type: typeName,
      items: groupsByType.get(typeName) ?? [],
    })
  }

  return NextResponse.json({ results })
})
