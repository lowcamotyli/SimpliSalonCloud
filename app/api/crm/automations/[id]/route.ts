import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

type PlanType = 'starter' | 'professional' | 'business' | 'enterprise'

const querySchema = z.object({
  salonId: z.string().uuid(),
})

const triggerTypeSchema = z.enum(['no_visit_days', 'birthday', 'after_visit', 'visit_count'])
const channelSchema = z.enum(['email', 'sms', 'both'])

const triggerConfigSchema = z
  .object({
    days: z.number().int().min(0).max(3650).optional(),
    count: z.number().int().min(1).max(10000).optional(),
    offsetDays: z.number().int().min(-31).max(31).optional(),
    dedupeDays: z.number().int().min(1).max(365).optional(),
  })
  .passthrough()

const updateSchema = z.object({
  salonId: z.string().uuid(),
  name: z.string().trim().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
  triggerType: triggerTypeSchema.optional(),
  triggerConfig: triggerConfigSchema.optional(),
  channel: channelSchema.optional(),
  templateId: z.string().uuid().optional(),
})

function getAutomationLimitForPlan(plan: PlanType): number | null {
  if (plan === 'professional') return 2
  if (plan === 'business') return 10
  if (plan === 'enterprise') return null
  return 0
}

function validateTriggerConfig(triggerType: z.infer<typeof triggerTypeSchema>, config: Record<string, any>) {
  if (triggerType === 'no_visit_days' || triggerType === 'after_visit') {
    if (!Number.isInteger(config.days) || config.days < 0) {
      throw new Error('Trigger config requires integer "days" >= 0')
    }
  }

  if (triggerType === 'visit_count') {
    if (!Number.isInteger(config.count) || config.count < 1) {
      throw new Error('Trigger config requires integer "count" >= 1')
    }
  }

  if (triggerType === 'birthday' && config.offsetDays !== undefined) {
    if (!Number.isInteger(config.offsetDays) || config.offsetDays < -31 || config.offsetDays > 31) {
      throw new Error('Trigger config "offsetDays" must be integer between -31 and 31')
    }
  }
}

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

  const feature = await checkFeatureAccess(salonId, 'crm_automations')
  if (!feature.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: feature.reason || 'CRM automations are not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

async function getPlanLimit(supabase: any, salonId: string) {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('subscription_plan')
    .eq('id', salonId)
    .maybeSingle()

  if (error || !salon) {
    throw new Error(error?.message || 'Salon not found')
  }

  return getAutomationLimitForPlan((salon.subscription_plan || 'starter') as PlanType)
}

async function ensureTemplateLinkage(supabase: any, salonId: string, templateId: string, channel: 'email' | 'sms' | 'both') {
  const { data: template } = await supabase
    .from('message_templates')
    .select('id, channel')
    .eq('id', templateId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (!template) {
    throw new Error('Template not found')
  }

  if (template.channel !== 'both' && template.channel !== channel) {
    throw new Error('Template channel mismatch')
  }
}

async function enforceActiveLimit(supabase: any, salonId: string, activeLimit: number | null, excludeId: string) {
  if (activeLimit === null) return

  const { count, error } = await supabase
    .from('crm_automations')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .neq('id', excludeId)

  if (error) throw new Error(error.message)
  if ((count || 0) >= activeLimit) {
    throw new Error(`Active automations limit reached (${count}/${activeLimit})`)
  }
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
      .from('crm_automations')
      .select('id, salon_id, name, is_active, trigger_type, trigger_config, channel, template_id, last_run_at, created_at, updated_at')
      .eq('id', id)
      .eq('salon_id', parsedQuery.data.salonId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Automation not found' }, { status: 404 })

    return NextResponse.json({ automation: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch automation' },
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

    const { data: existing, error: existingError } = await (supabase as any)
      .from('crm_automations')
      .select('id, salon_id, name, is_active, trigger_type, trigger_config, channel, template_id')
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .maybeSingle()

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Automation not found' }, { status: 404 })

    const nextTriggerType = payload.triggerType || existing.trigger_type
    const nextTriggerConfig = payload.triggerConfig || existing.trigger_config || {}
    const nextChannel = payload.channel || existing.channel
    const nextTemplateId = payload.templateId || existing.template_id
    const nextActive = payload.isActive ?? existing.is_active

    validateTriggerConfig(nextTriggerType, nextTriggerConfig)
    await ensureTemplateLinkage(supabase as any, payload.salonId, nextTemplateId, nextChannel)

    if (nextActive && !existing.is_active) {
      const activeLimit = await getPlanLimit(supabase as any, payload.salonId)
      await enforceActiveLimit(supabase as any, payload.salonId, activeLimit, id)
    }

    const updates: Record<string, unknown> = {
      is_active: nextActive,
      trigger_type: nextTriggerType,
      trigger_config: nextTriggerConfig,
      channel: nextChannel,
      template_id: nextTemplateId,
    }

    if (typeof payload.name === 'string') updates.name = payload.name

    const { data, error } = await (supabase as any)
      .from('crm_automations')
      .update(updates)
      .eq('id', id)
      .eq('salon_id', payload.salonId)
      .select('id, salon_id, name, is_active, trigger_type, trigger_config, channel, template_id, last_run_at, created_at, updated_at')
      .maybeSingle()

    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    if (!data) return NextResponse.json({ error: 'Automation not found' }, { status: 404 })

    return NextResponse.json({ automation: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'Failed to update automation'
    const status = message.includes('limit reached') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
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

    const { data, error } = await (supabase as any)
      .from('crm_automations')
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
      return NextResponse.json({ error: 'Automation not found or insufficient permissions' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete automation' },
      { status: 500 }
    )
  }
}

