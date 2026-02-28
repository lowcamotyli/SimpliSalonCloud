import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClientSchema } from '@/lib/validators/client.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import { applyRateLimit } from '@/lib/middleware/rate-limit'

// GET /api/clients - List all clients
export const GET = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request)
  if (rl) return rl

  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }

  // Get query params
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  let query = supabase
    .from('clients')
    .select('*')
    .eq('salon_id', typedProfile.salon_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (search) {
    const sanitizedSearch = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
    query = query.or(
      `full_name.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`
    )
  }

  const { data: clients, error } = await query.limit(200)

  if (error) throw error

  return NextResponse.json({ clients })
})

// POST /api/clients - Create new client
export const POST = withErrorHandling(async (request: NextRequest) => {
  const rl = await applyRateLimit(request, { limit: 30 })
  if (rl) return rl

  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }

  const body = await request.json()

  // Map frontend fields and add salon_id
  const mappedBody = {
    ...body,
    salon_id: typedProfile.salon_id,
    first_name: body.first_name || body.firstName || (body.fullName ? body.fullName.split(' ')[0] : ''),
    last_name: body.last_name || body.lastName || (body.fullName ? body.fullName.split(' ').slice(1).join(' ') : ''),
  }

  const validatedData = createClientSchema.parse(mappedBody)

  // Generate client code with fallback
  const { data: codeData, error: codeError } = await (supabase as any)
    .rpc('generate_client_code', { salon_uuid: validatedData.salon_id })

  const clientCode = codeData || `C${Date.now().toString().slice(-6)}`

  const { data: client, error } = await (supabase as any)
    .from('clients')
    .insert({
      salon_id: validatedData.salon_id,
      client_code: clientCode,
      full_name: `${validatedData.first_name} ${validatedData.last_name}`,
      phone: validatedData.phone,
      email: validatedData.email || null,
      notes: validatedData.notes || null,
      visit_count: 0
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return NextResponse.json({ client }, { status: 201 })
})
