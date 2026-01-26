import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's profile with salon info
  // Use specific foreign key to avoid ambiguity (we added deleted_by which also references profiles)
  const { data: profile } = await supabase
    .from('profiles')
    .select('salon_id, salons!profiles_salon_id_fkey(slug)')
    .eq('user_id', user.id)
    .single()

  if (profile?.salons) {
    const salonSlug = (profile.salons as any).slug
    if (salonSlug) {
      redirect(`/${salonSlug}/dashboard`)
    }
  }

  // If no salon found, redirect to login
  redirect('/login')
}