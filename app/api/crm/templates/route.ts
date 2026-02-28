import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const createTemplateSchema = z
  .object({
    salonId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    channel: z.enum(['email', 'sms', 'both']),
    subject: z.string().trim().max(200).optional().nullable(),
    body: z.string().trim().min(1).max(8000),
  })
  .superRefine((data, ctx) => {
    if ((data.channel === 'email' || data.channel === 'both') && !data.subject?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subject'],
        message: 'Subject is required for email templates',
      })
    }
  })

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const salonId = request.nextUrl.searchParams.get('salonId')
    const parsedQuery = querySchema.safeParse({ salonId })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const feature = await checkFeatureAccess(parsedQuery.data.salonId, 'crm_campaigns')
    if (!feature.allowed) {
      return NextResponse.json(
        { error: feature.reason || 'CRM templates are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      )
    }

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .select('id, salon_id, name, channel, subject, body, created_at, updated_at')
      .eq('salon_id', parsedQuery.data.salonId)
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ templates: data || [] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createTemplateSchema.parse(body)

    const { data: membership, error: membershipError } = await (supabase as any)
      .from('profiles')
      .select('salon_id')
      .eq('user_id', user.id)
      .eq('salon_id', parsed.salonId)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const feature = await checkFeatureAccess(parsed.salonId, 'crm_campaigns')
    if (!feature.allowed) {
      return NextResponse.json(
        { error: feature.reason || 'CRM templates are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      )
    }

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .insert({
        salon_id: parsed.salonId,
        name: parsed.name,
        channel: parsed.channel,
        subject: parsed.subject?.trim() || null,
        body: parsed.body,
      })
      .select('id, salon_id, name, channel, subject, body, created_at, updated_at')
      .single()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ template: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 500 }
    )
  }
}

