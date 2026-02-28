import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateClientSchema } from '@/lib/validators/client.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import type { Database } from '@/types/supabase'

type ClientUpdate = Database['public']['Tables']['clients']['Update']

// GET /api/clients/[id]
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Client', id)
    throw error
  }

  if (!client) {
    throw new NotFoundError('Client', id)
  }

  if ((client as any).salon_id !== user.app_metadata?.salon_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ client })
})

// PUT /api/clients/[id]
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
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
    .select('version, salon_id')
    .eq('id', id)
    .single()

  if (existingError || !existingClient) {
    throw new NotFoundError('Client', id)
  }

  if ((existingClient as any).salon_id !== user.app_metadata?.salon_id) {
    throw new NotFoundError('Client', id)
  }

  const updateData: ClientUpdate = {
    version: (existingClient as { version: number }).version, // Required by check_version() trigger
  }
  if (validatedData.first_name || validatedData.last_name) {
    updateData.full_name = `${validatedData.first_name || ''} ${validatedData.last_name || ''}`.trim()
  }
  if (validatedData.phone) updateData.phone = validatedData.phone
  if (validatedData.email !== undefined) updateData.email = validatedData.email || null
  if (validatedData.notes !== undefined) updateData.notes = validatedData.notes || null

  const { data: client, error } = await (supabase as any)
    .from('clients')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Client', id)
    throw error
  }

  return NextResponse.json({ client })
})
