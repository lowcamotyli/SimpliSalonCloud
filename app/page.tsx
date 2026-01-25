import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createServerSupabaseClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user's salon
  const { data: profile } = await supabase
    .from('profiles')
    .select('salons(slug)')
    .eq('user_id', user.id)
    .single()

  if (profile) {
    // @ts-ignore
    const salonSlug = profile.salons?.slug
    if (salonSlug) {
      redirect(`/${salonSlug}/dashboard`)
    }
  }

  redirect('/login')
}