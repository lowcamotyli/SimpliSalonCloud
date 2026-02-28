import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const updateTemplateSchema = z
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

async function authorize(supabase: any, salonId: string, userId: string) {
  const { data: membership, error: membershipError } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (membershipError) {
    return { ok: false as const, response: NextResponse.json({ error: membershipError.message }, { status: 500 }) }
  }

  if (!membership) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const feature = await checkFeatureAccess(salonId, 'crm_campaigns')
  if (!feature.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: feature.reason || 'CRM templates are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .select('id, salon_id, name, channel, subject, body, created_at, updated_at')
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = updateTemplateSchema.parse(body)

    const auth = await authorize(supabase as any, parsed.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .update({
        name: parsed.name,
        channel: parsed.channel,
        subject: parsed.subject?.trim() || null,
        body: parsed.body,
      })
      .eq('id', id)
      .eq('salon_id', parsed.salonId)
      .select('id, salon_id, name, channel, subject, body, created_at, updated_at')
      .maybeSingle()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    if (!data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .delete()
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .select('id')
      .maybeSingle()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    if (!data) {
      return NextResponse.json({ error: 'Template not found or insufficient permissions' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    )
  }
}

