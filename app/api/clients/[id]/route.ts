import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateClientSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().regex(/^\d{9}$/).optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
})

// GET /api/clients/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({ client })
  } catch (error: any) {
    console.error('GET /api/clients/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/clients/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateClientSchema.parse(body)

    const updateData: any = {}
    if (validatedData.fullName) updateData.full_name = validatedData.fullName
    if (validatedData.phone) updateData.phone = validatedData.phone
    if (validatedData.email !== undefined) updateData.email = validatedData.email || null
    if (validatedData.notes !== undefined) updateData.notes = validatedData.notes || null

    const { data: client, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ client })
  } catch (error: any) {
    console.error('PUT /api/clients/[id] error:', error)

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}