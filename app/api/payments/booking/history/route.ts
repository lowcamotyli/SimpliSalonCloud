import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/error-handler'
import { ForbiddenError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'
import { createClient } from '@/lib/supabase/server'

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

type PaymentRow = {
  id: string
  booking_id: string
  amount: number
  status: string
  paid_at: string | null
  created_at: string | null
  bookings:
    | {
        id: string
        salon_id: string
        clients:
          | {
              full_name: string | null
              salon_id: string
            }
          | {
              first_name?: string | null
              last_name?: string | null
              salon_id: string
            }[]
          | null
        services:
          | {
              name: string
              salon_id: string
            }
          | {
              name: string
              salon_id: string
            }[]
          | null
      }
    | null
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeStatus(value: string | null): PaymentStatus | undefined {
  if (!value) return undefined

  const allowed: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded', 'cancelled']
  return allowed.includes(value as PaymentStatus) ? (value as PaymentStatus) : undefined
}

function getClientName(
  client:
    | PaymentRow['bookings']
    | NonNullable<PaymentRow['bookings']>['clients']
) {
  if (!client || 'id' in client) {
    return 'Nieznany klient'
  }

  const resolvedClient = Array.isArray(client) ? client[0] : client

  if (!resolvedClient) {
    return 'Nieznany klient'
  }

  if ('full_name' in resolvedClient && resolvedClient.full_name) {
    return resolvedClient.full_name
  }

  const firstName = 'first_name' in resolvedClient ? resolvedClient.first_name?.trim() : ''
  const lastName = 'last_name' in resolvedClient ? resolvedClient.last_name?.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return fullName || 'Nieznany klient'
}

function getServiceName(service: NonNullable<PaymentRow['bookings']>['services']) {
  if (!service) {
    return 'Nieznana usługa'
  }

  const resolvedService = Array.isArray(service) ? service[0] : service
  return resolvedService?.name ?? 'Nieznana usługa'
}

export const GET = withErrorHandling(async (request: NextRequest): Promise<NextResponse> => {
  const authClient = await createClient()
  const { supabase, salonId, user } = await getAuthContext()
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    throw authError ?? new ForbiddenError('Forbidden')
  }

  const permissions = Array.isArray(authUser.app_metadata?.permissions)
    ? authUser.app_metadata.permissions.filter(
        (permission): permission is string => typeof permission === 'string'
      )
    : []

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, salon_id')
    .eq('user_id', user.id)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (profileError) {
    throw profileError
  }

  const role = profile?.role ?? null
  const hasPermission = permissions.includes('*') || permissions.includes('finance:view')

  if (!hasPermission && role !== 'owner' && role !== 'manager') {
    throw new ForbiddenError('Forbidden')
  }

  const page = parsePositiveInt(request.nextUrl.searchParams.get('page'), 1)
  const limit = Math.min(parsePositiveInt(request.nextUrl.searchParams.get('limit'), 20), 100)
  const status = normalizeStatus(request.nextUrl.searchParams.get('status'))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('booking_payments')
    .select(
      `
        id,
        booking_id,
        amount,
        status,
        paid_at,
        created_at,
        payment_url,
        bookings!inner(
          id,
          salon_id,
          clients!inner(full_name, salon_id),
          services!inner(name, salon_id)
        )
      `,
      { count: 'exact' }
    )
    .eq('salon_id', salonId)
    .eq('bookings.salon_id', salonId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  const payments = ((data ?? []) as PaymentRow[]).map((payment) => ({
    id: payment.id,
    bookingId: payment.booking_id,
    clientName: getClientName(payment.bookings?.clients ?? null),
    serviceName: getServiceName(payment.bookings?.services ?? null),
    amount: payment.amount,
    status: payment.status,
    paidAt: payment.paid_at,
    createdAt: payment.created_at,
  }))

  return NextResponse.json({
    payments,
    total: count ?? 0,
    page,
    limit,
  })
})
