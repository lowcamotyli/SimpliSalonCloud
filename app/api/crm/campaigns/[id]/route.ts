import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const updateSchema = z.object({
  salonId: z.string().uuid(),
  name: z.string().trim().min(2).max(150).optional(),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  templateId: z.string().uuid().optional().nullable(),
  segmentFilters: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().max(8000).optional().nullable(),
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
        { error: feature.reason || 'CRM campaigns are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

async function resolveTemplateIdForUpdate(supabase: any, payload: z.infer<typeof updateSchema>) {
  if (payload.templateId) {
    const { data: template } = await supabase
      .from('message_templates')
      .select('id')
      .eq('id', payload.templateId)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (!template) {
      throw new Error('Template not found')
    }

    return payload.templateId
  }

  if (payload.body?.trim()) {
    const effectiveChannel = payload.channel || 'email'
    const { data: createdTemplate, error } = await supabase
      .from('message_templates')
      .insert({
        salon_id: payload.salonId,
        name: `[Campaign update] ${new Date().toISOString()}`,
        channel: effectiveChannel,
        subject: payload.subject?.trim() || null,
        body: payload.body.trim(),
      })
      .select('id')
      .single()

    if (error || !createdTemplate?.id) {
      throw new Error(error?.message || 'Failed to create template')
    }

    return createdTemplate.id as string
  }

  return undefined
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

    const parsedQuery = querySchema.safeParse({ salonId: request.nextUrl.searchParams.get('salonId') })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data, error } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, salon_id, name, status, channel, template_id, segment_filters, scheduled_at, sent_at, recipient_count, sent_count, failed_count, qstash_message_id, created_at, updated_at')
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    return NextResponse.json({ campaign: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaign' },
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

    const payload = updateSchema.parse(await request.json())
    const auth = await authorize(supabase as any, payload.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data: existing } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 409 })
    }

    const templateId = await resolveTemplateIdForUpdate(supabase as any, payload)
    const updates: Record<string, unknown> = {}

    if (typeof payload.name === 'string') updates.name = payload.name
    if (payload.channel) updates.channel = payload.channel
    if (payload.segmentFilters) updates.segment_filters = payload.segmentFilters
    if (payload.scheduledAt !== undefined) updates.scheduled_at = payload.scheduledAt
    if (templateId) updates.template_id = templateId
    if (payload.templateId === null) updates.template_id = null

    const { data, error } = await (supabase as any)
      .from('crm_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .select('id, salon_id, name, status, channel, template_id, segment_filters, scheduled_at, sent_at, recipient_count, sent_count, failed_count, qstash_message_id, created_at, updated_at')
      .maybeSingle()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    if (!data) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    return NextResponse.json({ campaign: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update campaign' },
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

    const parsedQuery = querySchema.safeParse({ salonId: request.nextUrl.searchParams.get('salonId') })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data: existing } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (existing.status === 'sending') {
      return NextResponse.json({ error: 'Campaign is currently sending and cannot be deleted' }, { status: 409 })
    }

    const { error } = await (supabase as any)
      .from('crm_campaigns')
      .delete()
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete campaign' },
      { status: 500 }
    )
  }
}

