import { NotFoundError, UnauthorizedError } from '@/lib/errors'
import { createServerSupabaseClient, hasSupabaseSessionCookie } from '@/lib/supabase/server'

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  user: { id: string; email?: string }
  salonId: string
}

/**
 * Returns authenticated user + their salon_id.
 * Throws UnauthorizedError (401) if not logged in.
 * Throws NotFoundError (404) if profile missing.
 */
export async function getAuthContext(): Promise<AuthContext> {
  if (!(await hasSupabaseSessionCookie())) {
    throw new UnauthorizedError()
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new UnauthorizedError()
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('salon_id')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile?.salon_id) {
    throw new NotFoundError('Profile')
  }

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email ?? undefined,
    },
    salonId: profile.salon_id,
  }
}
