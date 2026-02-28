import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError, NotFoundError } from '@/lib/errors'

// GET /api/integrations/booksy/pending
// Query params: ?status=pending|resolved|ignored|all (default: 'pending')
export const GET = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile } = await (supabase.from('profiles') as any)
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.salon_id) {
    throw new NotFoundError('Profile')
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

  let query = (supabase as any).from('booksy_pending_emails')
    .select('*')
    .eq('salon_id', profile.salon_id)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: rows, error } = await query
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  return NextResponse.json({
    pending: rows || [],
    count: rows?.length || 0,
  })
})
