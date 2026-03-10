import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const querySchema = z.object({
  salonId: z.string().uuid(),
  source: z.enum(['sms_direct', 'crm']).default('crm'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  channel: z.enum(['email', 'sms']).optional(),
})

type QueryFilters = z.infer<typeof querySchema>

type JoinedClient = {
  full_name: string | null
} | null

type JoinedCampaign = {
  name: string | null
} | null

type CrmLogRow = {
  id: string
  salon_id: string
  campaign_id: string | null
  automation_id: string | null
  client_id: string | null
  channel: 'email' | 'sms' | null
  recipient: string | null
  subject: string | null
  body: string | null
  status: string | null
  error: string | null
  sent_at: string | null
  created_at: string
  clients: JoinedClient
  crm_campaigns: JoinedCampaign
}

type SmsLogRow = {
  id: string
  salon_id: string
  client_id: string | null
  direction: string
  body: string | null
  status: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
  clients: JoinedClient
}

type NormalizedLog = {
  id: string
  source: 'crm' | 'sms_direct'
  created_at: string
  sent_at: string | null
  channel: 'email' | 'sms' | null
  status: string | null
  body: string | null
  subject: string | null
  recipient: string | null
  error: string | null
  client_id: string | null
  client_name: string | null
  campaign_id: string | null
  campaign_name: string | null
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

  return { ok: true as const }
}

function applyCommonFilters(query: any, filters: QueryFilters) {
  let nextQuery = query.eq('salon_id', filters.salonId)

  if (filters.status) {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  if (filters.clientId) {
    nextQuery = nextQuery.eq('client_id', filters.clientId)
  }

  if (filters.from) {
    nextQuery = nextQuery.gte('created_at', filters.from)
  }

  if (filters.to) {
    nextQuery = nextQuery.lte('created_at', filters.to)
  }

  return nextQuery
}

function normalizeCrmLog(row: CrmLogRow): NormalizedLog {
  return {
    id: row.id,
    source: 'crm',
    created_at: row.created_at,
    sent_at: row.sent_at,
    channel: row.channel,
    status: row.status,
    body: row.body,
    subject: row.subject,
    recipient: row.recipient,
    error: row.error,
    client_id: row.client_id,
    client_name: row.clients?.full_name ?? null,
    campaign_id: row.campaign_id,
    campaign_name: row.crm_campaigns?.name ?? null,
  }
}

function normalizeSmsLog(row: SmsLogRow): NormalizedLog {
  return {
    id: row.id,
    source: 'sms_direct',
    created_at: row.created_at,
    sent_at: row.sent_at,
    channel: 'sms',
    status: row.status,
    body: row.body,
    subject: null,
    recipient: null,
    error: row.error_message,
    client_id: row.client_id,
    client_name: row.clients?.full_name ?? null,
    campaign_id: null,
    campaign_name: null,
  }
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

    const parsedQuery = querySchema.safeParse({
      salonId: request.nextUrl.searchParams.get('salonId'),
      source: request.nextUrl.searchParams.get('source') || 'crm',
      page: request.nextUrl.searchParams.get('page') || '1',
      pageSize: request.nextUrl.searchParams.get('pageSize') || '25',
      status: request.nextUrl.searchParams.get('status') || undefined,
      clientId: request.nextUrl.searchParams.get('clientId') || undefined,
      from: request.nextUrl.searchParams.get('from') || undefined,
      to: request.nextUrl.searchParams.get('to') || undefined,
      channel: request.nextUrl.searchParams.get('channel') || undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const filters = parsedQuery.data
    const auth = await authorize(supabase as any, filters.salonId, user.id)
    if (!auth.ok) return auth.response

    const fromIndex = (filters.page - 1) * filters.pageSize
    const toIndex = fromIndex + filters.pageSize - 1

    if (filters.source === 'sms_direct') {
      const countQuery = applyCommonFilters(
        (supabase as any).from('sms_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound'),
        filters
      )

      const { count, error: countError } = await countQuery
      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
      }

      const dataQuery = applyCommonFilters(
        (supabase as any)
          .from('sms_messages')
          .select(
            'id, salon_id, client_id, direction, body, status, error_message, sent_at, created_at, clients:client_id(full_name)'
          )
          .eq('direction', 'outbound')
          .order('created_at', { ascending: false })
          .range(fromIndex, toIndex),
        filters
      )

      const { data, error } = await dataQuery
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const total = count || 0
      const totalPages = total > 0 ? Math.ceil(total / filters.pageSize) : 1

      return NextResponse.json({
        logs: ((data || []) as SmsLogRow[]).map(normalizeSmsLog),
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          total,
          totalPages,
          hasNextPage: filters.page < totalPages,
          hasPreviousPage: filters.page > 1,
        },
      })
    }

    let crmCountQuery = applyCommonFilters(
      (supabase as any).from('message_logs').select('id', { count: 'exact', head: true }),
      filters
    )

    if (filters.channel) {
      crmCountQuery = crmCountQuery.eq('channel', filters.channel)
    }

    const { count, error: countError } = await crmCountQuery
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    let crmDataQuery = applyCommonFilters(
      (supabase as any)
        .from('message_logs')
        .select(
          'id, salon_id, campaign_id, automation_id, client_id, channel, recipient, subject, body, status, error, sent_at, created_at, clients:client_id(full_name), crm_campaigns:campaign_id(name)'
        )
        .order('created_at', { ascending: false })
        .range(fromIndex, toIndex),
      filters
    )

    if (filters.channel) {
      crmDataQuery = crmDataQuery.eq('channel', filters.channel)
    }

    const { data, error } = await crmDataQuery
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const total = count || 0
    const totalPages = total > 0 ? Math.ceil(total / filters.pageSize) : 1

    return NextResponse.json({
      logs: ((data || []) as CrmLogRow[]).map(normalizeCrmLog),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages,
        hasNextPage: filters.page < totalPages,
        hasPreviousPage: filters.page > 1,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notification logs' },
      { status: 500 }
    )
  }
}
