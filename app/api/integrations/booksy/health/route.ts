import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getSalonHealth } from '@/lib/booksy/health-check'
import { ForbiddenError, UnauthorizedError, ValidationError } from '@/lib/errors'
import { getAuthContext } from '@/lib/supabase/get-auth-context'

const mailboxActionSchema = z.object({
  action: z.enum(['set_primary', 'deactivate']),
  accountId: z.string().uuid(),
})

async function requireOwnerRole(supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase']): Promise<void> {
  const { data, error } = await supabase.rpc('has_salon_role', {
    required_role: 'owner',
  })

  if (error) {
    throw error
  }

  if (!data) {
    throw new ForbiddenError('Only salon owner can manage Booksy mailboxes')
  }
}

async function ensureMailboxBelongsToSalon(
  supabase: Awaited<ReturnType<typeof getAuthContext>>['supabase'],
  salonId: string,
  accountId: string
): Promise<void> {
  const { data, error } = await (supabase
    .from('booksy_gmail_accounts') as any)
    .select('id')
    .eq('id', accountId)
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data?.id) {
    throw new ValidationError('Booksy mailbox not found for this salon')
  }
}

export async function GET(request: NextRequest) {
  void request

  try {
    const { supabase, salonId } = await getAuthContext()
    const result = await getSalonHealth(salonId, supabase)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, salonId } = await getAuthContext()
    await requireOwnerRole(supabase)

    const parsed = mailboxActionSchema.parse(await request.json())
    await ensureMailboxBelongsToSalon(supabase, salonId, parsed.accountId)

    if (parsed.action === 'set_primary') {
      const { error: clearError } = await (supabase
        .from('booksy_gmail_accounts') as any)
        .update({
          is_primary: false,
          updated_at: new Date().toISOString(),
        })
        .eq('salon_id', salonId)
        .eq('is_primary', true)

      if (clearError) {
        throw clearError
      }

      const { error: primaryError } = await (supabase
        .from('booksy_gmail_accounts') as any)
        .update({
          is_primary: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('salon_id', salonId)
        .eq('id', parsed.accountId)

      if (primaryError) {
        throw primaryError
      }
    }

    if (parsed.action === 'deactivate') {
      const { data: targetMailbox, error: targetError } = await (supabase
        .from('booksy_gmail_accounts') as any)
        .select('id, is_primary')
        .eq('salon_id', salonId)
        .eq('id', parsed.accountId)
        .single()

      if (targetError) {
        throw targetError
      }

      const { error: deactivateError } = await (supabase
        .from('booksy_gmail_accounts') as any)
        .update({
          is_active: false,
          is_primary: false,
          auth_status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('salon_id', salonId)
        .eq('id', parsed.accountId)

      if (deactivateError) {
        throw deactivateError
      }

      if (targetMailbox?.is_primary) {
        const { data: fallbackMailbox, error: fallbackLoadError } = await (supabase
          .from('booksy_gmail_accounts') as any)
          .select('id')
          .eq('salon_id', salonId)
          .eq('is_active', true)
          .neq('id', parsed.accountId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (fallbackLoadError) {
          throw fallbackLoadError
        }

        if (fallbackMailbox?.id) {
          const { error: fallbackUpdateError } = await (supabase
            .from('booksy_gmail_accounts') as any)
            .update({
              is_primary: true,
              updated_at: new Date().toISOString(),
            })
            .eq('salon_id', salonId)
            .eq('id', fallbackMailbox.id)

          if (fallbackUpdateError) {
            throw fallbackUpdateError
          }
        }
      }
    }

    const result = await getSalonHealth(salonId, supabase)
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    if (error instanceof ValidationError || error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid mailbox action payload' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
