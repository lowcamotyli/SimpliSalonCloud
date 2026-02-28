import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/middleware/feature-gate'

const querySchema = z.object({
  salonId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  channel: z.enum(['email', 'sms']).optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced']).optional(),
  campaignId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
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
        { error: feature.reason || 'CRM message history is not available', upgradeUrl: feature.upgradeUrl },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

function applyFilters(query: any, filters: z.infer<typeof querySchema>) {
  let nextQuery = query.eq('salon_id', filters.salonId)

  if (filters.channel) {
    nextQuery = nextQuery.eq('channel', filters.channel)
  }

  if (filters.status) {
    nextQuery = nextQuery.eq('status', filters.status)
  }

  if (filters.campaignId) {
    nextQuery = nextQuery.eq('campaign_id', filters.campaignId)
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
      page: request.nextUrl.searchParams.get('page') || '1',
      pageSize: request.nextUrl.searchParams.get('pageSize') || '25',
      channel: request.nextUrl.searchParams.get('channel') || undefined,
      status: request.nextUrl.searchParams.get('status') || undefined,
      campaignId: request.nextUrl.searchParams.get('campaignId') || undefined,
      clientId: request.nextUrl.searchParams.get('clientId') || undefined,
      from: request.nextUrl.searchParams.get('from') || undefined,
      to: request.nextUrl.searchParams.get('to') || undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.errors }, { status: 400 })
    }

    const filters = parsedQuery.data

    const auth = await authorize(supabase as any, filters.salonId, user.id)
    if (!auth.ok) return auth.response

    const fromIndex = (filters.page - 1) * filters.pageSize
    const toIndex = fromIndex + filters.pageSize - 1

    const countQuery = applyFilters(
      (supabase as any).from('message_logs').select('id', { count: 'exact', head: true }),
      filters
    )

    const { count, error: countError } = await countQuery
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    const dataQuery = applyFilters(
      (supabase as any)
        .from('message_logs')
        .select(
          'id, created_at, sent_at, channel, subject, body, status, client_id, campaign_id, recipient, error, clients:client_id(full_name), crm_campaigns:campaign_id(name)'
        )
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
      logs: data || [],
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
      { error: error instanceof Error ? error.message : 'Failed to fetch CRM message logs' },
      { status: 500 }
    )
  }
}

