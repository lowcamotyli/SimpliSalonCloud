import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

type HealthDataAccessLog = {
  id: string
  accessed_at: string
  accessed_by: string | null
  accessed_by_role: string | null
  action: string | null
  client_id: string | null
  data_category: string | null
  ip_address: string | null
  resource_id: string | null
  resource_type: string | null
  salon_id: string
  user_agent: string | null
}

function parseIsoDate(value: string | null, fieldName: 'from' | 'to') {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO date`)
  }

  return parsed.toISOString()
}

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : 50

  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new ValidationError('limit must be a number')
  }

  return Math.min(Math.max(parsed, 0), 100)
}

function parseOffset(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : 0

  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new ValidationError('offset must be a number')
  }

  return Math.max(parsed, 0)
}

function applyFilters<TQuery extends {
  eq: (column: string, value: string) => TQuery
  gte: (column: string, value: string) => TQuery
  lte: (column: string, value: string) => TQuery
}>(query: TQuery, filters: { salonId: string; from: string | null; to: string | null; dataCategory: string | null }) {
  let nextQuery = query.eq('salon_id', filters.salonId)

  if (filters.from) {
    nextQuery = nextQuery.gte('accessed_at', filters.from)
  }

  if (filters.to) {
    nextQuery = nextQuery.lte('accessed_at', filters.to)
  }

  if (filters.dataCategory) {
    nextQuery = nextQuery.eq('data_category', filters.dataCategory)
  }

  return nextQuery
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { supabase, salonId } = await getAuthContext()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new ForbiddenError()
  }

  const role = user.app_metadata?.role
  if (role !== 'owner') {
    throw new ForbiddenError()
  }

  const from = parseIsoDate(request.nextUrl.searchParams.get('from'), 'from')
  const to = parseIsoDate(request.nextUrl.searchParams.get('to'), 'to')
  const dataCategory = request.nextUrl.searchParams.get('data_category')
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))
  const offset = parseOffset(request.nextUrl.searchParams.get('offset'))

  let countQuery = supabase
    .from('health_data_access_logs')
    .select('*', { count: 'exact', head: true })

  countQuery = applyFilters(countQuery, {
    salonId,
    from,
    to,
    dataCategory,
  })

  const { count, error: countError } = await countQuery
  if (countError) {
    throw countError
  }

  let logsQuery = supabase
    .from('health_data_access_logs')
    .select(
      'id, accessed_at, accessed_by, accessed_by_role, action, client_id, data_category, ip_address, resource_id, resource_type, salon_id, user_agent'
    )
    .order('accessed_at', { ascending: false })
    .range(offset, offset + Math.max(limit - 1, 0))

  logsQuery = applyFilters(logsQuery, {
    salonId,
    from,
    to,
    dataCategory,
  })

  const { data, error } = await logsQuery
  if (error) {
    throw error
  }

  return NextResponse.json({
    logs: (data ?? []) as HealthDataAccessLog[],
    total: count ?? 0,
  })
})
