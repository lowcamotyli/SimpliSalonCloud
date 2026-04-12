import type { AuthContext } from '@/lib/supabase/get-auth-context'

export async function getBalanceActorEmployeeId({
  supabase,
  salonId,
  user,
}: AuthContext): Promise<string | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('salon_id', salonId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.id ?? null
}
