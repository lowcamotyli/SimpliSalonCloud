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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('salon_id, salons!profiles_salon_id_fkey(slug)')
    .eq('user_id', user.id)
    .single()

  if (profileError) {
    console.error('Profile query error:', profileError)
    // If RLS is blocking, redirect to login with error
    redirect('/login?error=profile_not_found')
  }

  if (profile?.salons) {
    const salonSlug = (profile.salons as any).slug
    if (salonSlug) {
      redirect(`/${salonSlug}/dashboard`)
    }
  }

  // If no salon found, redirect to login
  console.error('No salon found for user:', user.id)
  redirect('/login?error=no_salon')
}