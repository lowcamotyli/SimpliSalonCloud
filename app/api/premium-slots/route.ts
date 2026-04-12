import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/error-handler'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import type { Json, Tables, TablesInsert } from '@/types/supabase'

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

export const GET = withErrorHandling(async (_request: NextRequest): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()

  const { data: slots, error } = await supabase
    .from('premium_slots')
    .select('*')
    .eq('salon_id', salonId)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) throw error

  return NextResponse.json({
    slots: (slots ?? []) as PremiumSlot[],
  })
})

export const POST = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const { supabase, salonId } = await getAuthContext()
  const body = premiumSlotSchema.parse(await request.json())

  const insertPayload: TablesInsert<'premium_slots'> = {
    salon_id: salonId,
    name: body.name,
    date: body.date,
    start_time: body.start_time,
    end_time: body.end_time,
    employee_id: body.employee_id,
    service_ids: body.service_ids,
    price_modifier: body.price_modifier,
    requires_prepayment: body.requires_prepayment,
    segment_criteria: body.segment_criteria as Json | undefined,
  }

  const { data: slot, error } = await supabase
    .from('premium_slots')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) throw error

  return NextResponse.json(
    { slot: slot as PremiumSlot },
    { status: 201 }
  )
})
