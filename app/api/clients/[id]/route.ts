import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateClientSchema } from '@/lib/validators/client.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'

// GET /api/clients/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Client', params.id)
    throw error
  }

  if (!client) {
    throw new NotFoundError('Client', params.id)
  }

  return NextResponse.json({ client })
})

// PUT /api/clients/[id]
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const body = await request.json()
  const validatedData = updateClientSchema.parse(body)

  // Get current version
  const { data: existingClient, error: existingError } = await supabase
    .from('clients')
    .select('version')
    .eq('id', params.id)
    .single()

  if (existingError || !existingClient) {
    throw new NotFoundError('Client', params.id)
  }

  const updateData: any = {
    version: (existingClient as any).version, // Required by check_version() trigger
  }
  if (validatedData.first_name || validatedData.last_name) {
    updateData.full_name = `${validatedData.first_name || ''} ${validatedData.last_name || ''}`.trim()
  }
  if (validatedData.phone) updateData.phone = validatedData.phone
  if (validatedData.email !== undefined) updateData.email = validatedData.email || null
  if (validatedData.notes !== undefined) updateData.notes = validatedData.notes || null

  const { data: client, error } = await supabase
    .from('clients')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Client', params.id)
    throw error
  }

  return NextResponse.json({ client })
})