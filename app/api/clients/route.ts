import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClientSchema } from '@/lib/validators/client.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

// GET /api/clients - List all clients
export const GET = withErrorHandling(async (request: NextRequest) => {
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

  // Get query params
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')

  let query = supabase
    .from('clients')
    .select('*')
    .eq('salon_id', profile.salon_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    )
  }

  const { data: clients, error } = await query.limit(200)

  if (error) throw error

  return NextResponse.json({ clients })
})

// POST /api/clients - Create new client
export const POST = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const validatedData = createClientSchema.parse(body)

  // Generate client code
  const { data: codeData, error: codeError } = await supabase
    .rpc('generate_client_code', { salon_uuid: validatedData.salon_id })

  if (codeError) throw codeError

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      salon_id: validatedData.salon_id,
      client_code: codeData,
      full_name: `${validatedData.first_name} ${validatedData.last_name}`,
      phone: validatedData.phone,
      email: validatedData.email || null,
      notes: validatedData.notes || null,
      visit_count: 0
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ client }, { status: 201 })
})