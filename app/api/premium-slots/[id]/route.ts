import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { NotFoundError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Json, Tables, TablesUpdate } from '@/types/supabase'

type PremiumSlot = Tables<'premium_slots'>

const premiumSlotSchema = z.object({
  name: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:mm'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:mm'),
  employee_id: z.string().uuid().optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  price_modifier: z.number().optional(),
  requires_prepayment: z.boolean().optional(),
  segment_criteria: z.record(z.string(), z.unknown()).optional(),
})

const premiumSlotPatchSchema = premiumSlotSchema.partial()

export const DELETE = withErrorHandling(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()

  const { data: deletedSlot, error } = await supabase
    .from('premium_slots')
    .delete()
    .eq('id', id)
    .eq('salon_id', salonId)
    .select('id')
    .maybeSingle()

  if (error) throw error

  if (!deletedSlot) {
    throw new NotFoundError('Premium slot', id)
  }

  return new NextResponse(null, { status: 204 })
})

export const PATCH = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  const { id } = await params
  const { supabase, salonId } = await getAuthContext()
  const body = premiumSlotPatchSchema.parse(await request.json())

  if (Object.keys(body).length === 0) {
    const { data: existingSlot, error: existingError } = await supabase
      .from('premium_slots')
      .select('*')
      .eq('id', id)
      .eq('salon_id', salonId)
      .maybeSingle()

    if (existingError) throw existingError

    if (!existingSlot) {
      throw new NotFoundError('Premium slot', id)
    }

    return NextResponse.json({ slot: existingSlot as PremiumSlot })
  }

  const updatePayload: TablesUpdate<'premium_slots'> = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.date !== undefined ? { date: body.date } : {}),
    ...(body.start_time !== undefined ? { start_time: body.start_time } : {}),
    ...(body.end_time !== undefined ? { end_time: body.end_time } : {}),
    ...(body.employee_id !== undefined ? { employee_id: body.employee_id } : {}),
    ...(body.service_ids !== undefined ? { service_ids: body.service_ids } : {}),
    ...(body.price_modifier !== undefined ? { price_modifier: body.price_modifier } : {}),
    ...(body.requires_prepayment !== undefined
      ? { requires_prepayment: body.requires_prepayment }
      : {}),
    ...(body.segment_criteria !== undefined
      ? { segment_criteria: body.segment_criteria as Json }
      : {}),
  }

  const { data: slot, error } = await supabase
    .from('premium_slots')
    .update(updatePayload)
    .eq('id', id)
    .eq('salon_id', salonId)
    .select('*')
    .maybeSingle()

  if (error) throw error

  if (!slot) {
    throw new NotFoundError('Premium slot', id)
  }

  return NextResponse.json({ slot: slot as PremiumSlot })
})
