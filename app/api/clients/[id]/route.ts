import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateClientSchema } from '@/lib/validators/client.validators'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import type { Database } from '@/types/supabase'
import { applyRateLimit } from '@/lib/middleware/rate-limit'

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
  if (validatedData.tags !== undefined) updateData.tags = validatedData.tags

  const { data: client, error } = await (supabase as any)
    .from('clients')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Client', id)
    if (error.code === '23505' && error.message.includes('idx_clients_salon_phone')) {
      return NextResponse.json(
        { error: 'Ten numer telefonu jest już przypisany do innego klienta w Twoim salonie.' },
        { status: 409 }
      )
    }
    throw error
  }

  return NextResponse.json({ client })
})

export const PATCH = PUT

// DELETE /api/clients/[id] – soft-delete
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const rl = await applyRateLimit(request)
  if (rl) return rl

  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  // Resolve salon via profiles table (same pattern as GET /api/clients)
  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    throw new NotFoundError('Profile')
  }

  const typedProfile = profile as { salon_id: string }

  // Verify the client belongs to this salon
  const { data: existing, error: fetchError } = await supabase
    .from('clients')
    .select('id, salon_id, version')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !existing) {
    throw new NotFoundError('Client', id)
  }

  if ((existing as any).salon_id !== typedProfile.salon_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Soft-delete using admin client to bypass RLS (auth + ownership already verified above)
  const adminSupabase = createAdminSupabaseClient()
  const { error: deleteError } = await adminSupabase
    .from('clients')
    .update({
      deleted_at: new Date().toISOString(),
      version: (existing as any).version // Required by check_version() trigger
    })
    .eq('id', id)

  if (deleteError) throw deleteError

  return NextResponse.json({ success: true })
})
