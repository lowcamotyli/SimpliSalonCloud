import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const campaignUpsertSchema = z.object({
  salonId: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  channel: z.enum(['email', 'sms', 'both']),
  templateId: z.string().uuid().optional().nullable(),
  segmentFilters: z.record(z.any()).optional().default({}),
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

async function resolveTemplateIdForCreate(supabase: any, payload: z.infer<typeof campaignUpsertSchema>) {
  if (payload.templateId) {
    const { data: template } = await supabase
      .from('message_templates')
      .select('id, channel')
      .eq('id', payload.templateId)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (!template) {
      throw new Error('Template not found')
    }

    if (template.channel !== 'both' && template.channel !== payload.channel) {
      throw new Error('Template channel mismatch')
    }

    return payload.templateId
  }

  if (!payload.body?.trim()) {
    throw new Error('Either templateId or custom body is required')
  }

  if ((payload.channel === 'email' || payload.channel === 'both') && !payload.subject?.trim()) {
    throw new Error('Subject is required for email campaigns')
  }

  const { data: createdTemplate, error } = await supabase
    .from('message_templates')
    .insert({
      salon_id: payload.salonId,
      name: `[Campaign] ${payload.name}`,
      channel: payload.channel,
      subject: payload.subject?.trim() || null,
      body: payload.body.trim(),
    })
    .select('id')
    .single()

  if (error || !createdTemplate?.id) {
    throw new Error(error?.message || 'Failed to create template for campaign')
  }

  return createdTemplate.id as string
}

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

    const parsedQuery = querySchema.safeParse({ salonId: request.nextUrl.searchParams.get('salonId') })
    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const auth = await authorize(supabase as any, parsedQuery.data.salonId, user.id)
    if (!auth.ok) return auth.response

    const { data, error } = await (supabase as any)
      .from('crm_campaigns')
      .select('id, salon_id, name, status, channel, template_id, segment_filters, scheduled_at, sent_at, recipient_count, sent_count, failed_count, created_at, updated_at')
      .eq('salon_id', parsedQuery.data.salonId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ campaigns: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaigns' },
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

    const payload = campaignUpsertSchema.parse(await request.json())
    const auth = await authorize(supabase as any, payload.salonId, user.id)
    if (!auth.ok) return auth.response

    const templateId = await resolveTemplateIdForCreate(supabase as any, payload)

    const { data, error } = await (supabase as any)
      .from('crm_campaigns')
      .insert({
        salon_id: payload.salonId,
        name: payload.name,
        status: 'draft',
        channel: payload.channel,
        template_id: templateId,
        segment_filters: payload.segmentFilters || {},
        scheduled_at: payload.scheduledAt || null,
      })
      .select('id, salon_id, name, status, channel, template_id, segment_filters, scheduled_at, sent_at, recipient_count, sent_count, failed_count, created_at, updated_at')
      .single()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

