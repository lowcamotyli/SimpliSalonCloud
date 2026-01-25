import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateServiceSchema = z.object({
  category: z.string().min(2).optional(),
  subcategory: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  price: z.number().positive().optional(),
  duration: z.number().int().min(15).optional(),
  active: z.boolean().optional(),
})

// PATCH /api/services/[id] - Update service
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify service belongs to salon
    const { data: existingService } = await supabase
      .from('services')
      .select('id')
      .eq('id', params.id)
      .eq('salon_id', profile.salon_id)
      .single()

    if (!existingService) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateServiceSchema.parse(body)

    const updateData: any = {}
    if (validatedData.category !== undefined)
      updateData.category = validatedData.category
    if (validatedData.subcategory !== undefined)
      updateData.subcategory = validatedData.subcategory
    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.price !== undefined) updateData.price = validatedData.price
    if (validatedData.duration !== undefined)
      updateData.duration = validatedData.duration
    if (validatedData.active !== undefined)
      updateData.active = validatedData.active

    const { data: service, error } = await supabase
      .from('services')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ service })
  } catch (error: any) {
    console.error('PATCH /api/services/[id] error:', error)
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

// DELETE /api/services/[id] - Delete service
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify service belongs to salon
    const { data: existingService } = await supabase
      .from('services')
      .select('id')
      .eq('id', params.id)
      .eq('salon_id', profile.salon_id)
      .single()

    if (!existingService) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    // Check if service is used in bookings
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', params.id)

    if (count && count > 0) {
      return NextResponse.json(
        {
          error:
            'Nie można usunąć usługi, która jest używana w rezerwacjach. Możesz ją dezaktywować.',
        },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/services/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
