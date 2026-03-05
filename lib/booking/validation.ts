import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function validateClientCanBook(
  phone: string,
  salonId: string
): Promise<{ allowed: boolean; message?: string }> {
  const normalizedPhone = phone.trim()
  if (!normalizedPhone || !salonId) {
    return { allowed: true }
  }

  const supabase = createAdminSupabaseClient()
  const { data: client, error } = await supabase
    .from('clients')
    .select('blacklist_status')
    .eq('phone', normalizedPhone)
    .eq('salon_id', salonId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (client?.blacklist_status === 'blacklisted') {
    return {
      allowed: false,
      message: 'Rezerwacja online jest niedostepna. Prosimy o kontakt telefoniczny z salonem.',
    }
  }

  return { allowed: true }
}
