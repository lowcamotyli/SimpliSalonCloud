import { Client as QStashClient } from '@upstash/qstash'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { sendEmailMessage } from '@/lib/messaging/email-sender'
import { sendSmsMessage } from '@/lib/messaging/sms-sender'
import { renderTemplate } from '@/lib/messaging/template-renderer'

type PlanType = 'starter' | 'professional' | 'business' | 'enterprise'
type CampaignChannel = 'email' | 'sms' | 'both'
type MessageChannel = 'email' | 'sms'

const CHANNEL_LIMITS_BY_PLAN: Record<PlanType, { email: number; sms: number }> = {
  starter: { email: 500, sms: 0 },
  professional: { email: 2000, sms: 200 },
  business: { email: 10000, sms: 1000 },
  enterprise: { email: Number.POSITIVE_INFINITY, sms: Number.POSITIVE_INFINITY },
}

export type SegmentFilters = {
  lastVisitDaysBefore?: number | null
  lastVisitDaysAfter?: number | null
  minVisitCount?: number | null
  maxVisitCount?: number | null
  minTotalSpent?: number | null
  maxTotalSpent?: number | null
  tags?: string[] | null
  hasEmail?: boolean | null
  hasPhone?: boolean | null
  smsOptIn?: boolean | null
  emailOptIn?: boolean | null
}

export type CampaignWorkerJob = {
  salonId: string
  campaignId: string
  clientId: string
  channel: MessageChannel
  automationId?: string
}

type CampaignRecipient = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  email_opt_in: boolean | null
  sms_opt_in: boolean | null
  visit_count: number | null
  total_spent: number | null
  last_visit_at: string | null
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function normalizeSegmentFilters(filters: unknown): SegmentFilters {
  if (!filters || typeof filters !== 'object') return {}
  return filters as SegmentFilters
}

function applySegmentFilters(query: any, filters: SegmentFilters) {
  if (typeof filters.lastVisitDaysBefore === 'number' && Number.isFinite(filters.lastVisitDaysBefore)) {
    const before = new Date(Date.now() - filters.lastVisitDaysBefore * 24 * 60 * 60 * 1000).toISOString()
    query = query.lte('last_visit_at', before)
  }

  if (typeof filters.lastVisitDaysAfter === 'number' && Number.isFinite(filters.lastVisitDaysAfter)) {
    const after = new Date(Date.now() - filters.lastVisitDaysAfter * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('last_visit_at', after)
  }

  if (typeof filters.minVisitCount === 'number') {
    query = query.gte('visit_count', filters.minVisitCount)
  }

  if (typeof filters.maxVisitCount === 'number') {
    query = query.lte('visit_count', filters.maxVisitCount)
  }

  if (typeof filters.minTotalSpent === 'number') {
    query = query.gte('total_spent', filters.minTotalSpent)
  }

  if (typeof filters.maxTotalSpent === 'number') {
    query = query.lte('total_spent', filters.maxTotalSpent)
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags)
  }

  if (filters.hasEmail === true) {
    query = query.not('email', 'is', null)
  }

  if (filters.hasPhone === true) {
    query = query.not('phone', 'is', null)
  }

  if (typeof filters.smsOptIn === 'boolean') {
    query = query.eq('sms_opt_in', filters.smsOptIn)
  }

  if (typeof filters.emailOptIn === 'boolean') {
    query = query.eq('email_opt_in', filters.emailOptIn)
  }

  return query
}

export async function countSegmentRecipients(salonId: string, filtersRaw: unknown): Promise<number> {
  const admin = createAdminSupabaseClient()
  const filters = normalizeSegmentFilters(filtersRaw)

  let query = (admin as any)
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .is('deleted_at', null)

  query = applySegmentFilters(query, filters)
  const { count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return count || 0
}

export async function listSegmentRecipients(salonId: string, filtersRaw: unknown, limit?: number) {
  const admin = createAdminSupabaseClient()
  const filters = normalizeSegmentFilters(filtersRaw)

  let query = (admin as any)
    .from('clients')
    .select('id, full_name, email, phone, email_opt_in, sms_opt_in, visit_count, total_spent, last_visit_at')
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  query = applySegmentFilters(query, filters)

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export function campaignChannelToMessageChannels(channel: CampaignChannel): MessageChannel[] {
  if (channel === 'both') return ['email', 'sms']
  return [channel]
}

export function canDeliverToChannel(recipient: CampaignRecipient, channel: MessageChannel) {
  if (channel === 'email') {
    return !!recipient.email && recipient.email_opt_in !== false
  }

  return !!recipient.phone && recipient.sms_opt_in !== false
}

export function buildCampaignJobs(params: {
  salonId: string
  campaignId: string
  recipients: CampaignRecipient[]
  channel: CampaignChannel
}) {
  const channels = campaignChannelToMessageChannels(params.channel)
  const jobs: CampaignWorkerJob[] = []

  for (const recipient of params.recipients) {
    for (const ch of channels) {
      if (canDeliverToChannel(recipient, ch)) {
        jobs.push({
          salonId: params.salonId,
          campaignId: params.campaignId,
          clientId: recipient.id,
          channel: ch,
        })
      }
    }
  }

  return jobs
}

export async function checkPlanLimits(salonId: string, channel: MessageChannel, count: number) {
  const admin = createAdminSupabaseClient()
  const { data: salon, error: salonError } = await (admin as any)
    .from('salons')
    .select('id, slug, subscription_plan')
    .eq('id', salonId)
    .single()

  if (salonError || !salon) {
    throw new Error('Salon not found')
  }

  const plan = (salon.subscription_plan || 'starter') as PlanType
  const limit = CHANNEL_LIMITS_BY_PLAN[plan][channel]
  const month = getCurrentMonth()

  const { data: usage } = await (admin as any)
    .from('usage_tracking')
    .select('emails_sent_count, sms_sent_count')
    .eq('salon_id', salonId)
    .eq('period_month', month)
    .maybeSingle()

  const current = channel === 'email' ? usage?.emails_sent_count || 0 : usage?.sms_sent_count || 0
  const projected = current + Math.max(0, count)

  if (projected > limit) {
    return {
      allowed: false,
      channel,
      current,
      requested: count,
      projected,
      limit,
      upgradeUrl: `/${salon.slug}/billing/upgrade`,
      reason: `Monthly ${channel.toUpperCase()} limit exceeded (${current}/${limit})`,
    }
  }

  return {
    allowed: true,
    channel,
    current,
    requested: count,
    projected,
    limit,
  }
}

export async function enqueueCampaign(params: {
  jobs: CampaignWorkerJob[]
  scheduledAt?: string | null
  retries?: number
}) {
  const token = process.env.QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!token) {
    throw new Error('QSTASH_TOKEN is not configured')
  }

  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured')
  }

  const client = new QStashClient({ token })
  const workerUrl = `${appUrl.replace(/\/$/, '')}/api/crm/campaigns/worker`

  const delay = params.scheduledAt
    ? Math.max(0, Math.floor((new Date(params.scheduledAt).getTime() - Date.now()) / 1000))
    : 0

  const messageIds: string[] = []

  for (const job of params.jobs) {
    const result = await client.publishJSON({
      url: workerUrl,
      body: job,
      retries: params.retries ?? 3,
      delay,
    } as any)

    const messageId = (result as any)?.messageId || (result as any)?.message_id || null
    if (messageId) messageIds.push(messageId)
  }

  return { messageIds }
}

async function incrementUsageCounter(salonId: string, channel: MessageChannel) {
  const admin = createAdminSupabaseClient()
  const month = getCurrentMonth()

  const { error } = await (admin as any).rpc('crm_increment_usage_counter', {
    p_salon_id: salonId,
    p_period_month: month,
    p_channel: channel,
    p_increment_by: 1,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function bumpCampaignCounter(campaignId: string, field: 'sent_count' | 'failed_count') {
  const admin = createAdminSupabaseClient()

  const { error } = await (admin as any).rpc('crm_increment_campaign_counter', {
    p_campaign_id: campaignId,
    p_counter_name: field,
    p_increment_by: 1,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function maybeFinalizeCampaign(campaignId: string) {
  const admin = createAdminSupabaseClient()
  const { data: campaign } = await (admin as any)
    .from('crm_campaigns')
    .select('id, status, recipient_count, sent_count, failed_count')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign || campaign.status === 'cancelled') {
    return
  }

  const processed = (campaign.sent_count || 0) + (campaign.failed_count || 0)
  if ((campaign.recipient_count || 0) > 0 && processed >= campaign.recipient_count) {
    await (admin as any)
      .from('crm_campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignId)
  }
}

function buildRenderData(client: any, salon: any) {
  const fullName = (client?.full_name || '').trim()
  const [firstName, ...rest] = fullName.split(' ').filter(Boolean)
  const lastVisit = client?.last_visit_at ? new Date(client.last_visit_at) : null

  return {
    first_name: firstName || fullName,
    last_name: rest.join(' '),
    visit_count: client?.visit_count || 0,
    total_spent: client?.total_spent || 0,
    last_visit_date: lastVisit ? lastVisit.toLocaleDateString('pl-PL') : '',
    days_since_visit: lastVisit ? Math.max(0, Math.floor((Date.now() - lastVisit.getTime()) / (24 * 60 * 60 * 1000))) : '',
    salon_name: salon?.name || '',
    salon_phone: salon?.phone || '',
  }
}

export async function processMessage(input: CampaignWorkerJob) {
  const admin = createAdminSupabaseClient()

  const { data: campaign, error: campaignError } = await (admin as any)
    .from('crm_campaigns')
    .select('id, salon_id, status, template_id, channel, automation_id')
    .eq('id', input.campaignId)
    .eq('salon_id', input.salonId)
    .maybeSingle()

  if (campaignError || !campaign) {
    throw new Error(campaignError?.message || 'Campaign not found')
  }

  if (campaign.status === 'cancelled') {
    return { ok: true, skipped: true, reason: 'cancelled' }
  }

  const { data: client, error: clientError } = await (admin as any)
    .from('clients')
    .select('id, salon_id, full_name, email, phone, email_opt_in, sms_opt_in, visit_count, total_spent, last_visit_at')
    .eq('id', input.clientId)
    .eq('salon_id', input.salonId)
    .is('deleted_at', null)
    .maybeSingle()

  if (clientError || !client) {
    throw new Error(clientError?.message || 'Client not found')
  }

  const { data: template } = await (admin as any)
    .from('message_templates')
    .select('id, channel, subject, body')
    .eq('id', campaign.template_id)
    .eq('salon_id', input.salonId)
    .maybeSingle()

  if (!template) {
    throw new Error('Campaign template not found')
  }

  const { data: salon } = await (admin as any)
    .from('salons')
    .select('id, name, phone')
    .eq('id', input.salonId)
    .maybeSingle()

  const renderData = buildRenderData(client, salon)
  const renderedBody = renderTemplate(template.body || '', renderData, input.channel === 'email' ? 'email-safe' : 'sms-safe')
  const renderedSubject =
    input.channel === 'email' ? renderTemplate(template.subject || '', renderData, 'email-safe') : null

  const recipient = input.channel === 'email' ? client.email : client.phone
  const optedOut =
    (input.channel === 'email' && client.email_opt_in === false) ||
    (input.channel === 'sms' && client.sms_opt_in === false)

  const { data: log, error: logError } = await (admin as any)
    .from('message_logs')
    .insert({
      salon_id: input.salonId,
      campaign_id: input.campaignId,
      automation_id: input.automationId || campaign.automation_id || null,
      client_id: client.id,
      channel: input.channel,
      recipient: recipient || `${input.channel}:missing`,
      subject: renderedSubject,
      body: renderedBody,
      status: 'pending',
    })
    .select('id')
    .single()

  if (logError || !log?.id) {
    throw new Error(logError?.message || 'Failed to create message log')
  }

  if (!recipient || optedOut) {
    await (admin as any)
      .from('message_logs')
      .update({ status: 'failed', error: !recipient ? 'Missing recipient contact' : 'Recipient opted out' })
      .eq('id', log.id)

    await bumpCampaignCounter(input.campaignId, 'failed_count')

    await maybeFinalizeCampaign(input.campaignId)
    return { ok: true, skipped: true, reason: !recipient ? 'missing-recipient' : 'opt-out' }
  }

  try {
    if (input.channel === 'email') {
      await sendEmailMessage({
        salonId: input.salonId,
        messageLogId: log.id,
        to: recipient,
        subject: renderedSubject || '(no subject)',
        html: renderedBody,
        text: renderedBody,
      })
    } else {
      await sendSmsMessage({
        salonId: input.salonId,
        messageLogId: log.id,
        to: recipient,
        body: renderedBody,
      })
    }

    await bumpCampaignCounter(input.campaignId, 'sent_count')

    await incrementUsageCounter(input.salonId, input.channel)
    await maybeFinalizeCampaign(input.campaignId)

    return { ok: true }
  } catch (error) {
    await bumpCampaignCounter(input.campaignId, 'failed_count')

    await maybeFinalizeCampaign(input.campaignId)
    throw error
  }
}

