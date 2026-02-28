import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/navbar'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { ThemeKey } from '@/lib/types/settings'

type ProfileWithSalon = {
  salon_id: string
  role: string
  full_name: string | null
  salons: {
    id: string
    slug: string
    name: string
  } | null
}

type SalonThemeSettings = {
  theme: ThemeKey | null
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Get user's salon
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      salon_id,
      role,
      full_name,
      salons!profiles_salon_id_fkey (
        id,
        slug,
        name
      )
    `)
    .eq('user_id', user.id)
    .single()

  console.log('[Dashboard Layout] Profile query:', { profile, profileError, userId: user.id })

  if (profileError) {
    console.error('[Dashboard Layout] Profile query failed:', profileError)
    redirect('/login?error=dashboard_profile_query_failed')
  }

  if (!profile) {
    console.error('[Dashboard Layout] No profile found for user:', user.id)
    redirect('/login?error=no_profile')
  }

  const typedProfile = profile as ProfileWithSalon | null
  const salon = typedProfile?.salons

  if (!salon) {
    redirect('/login?error=no_salon')
  }

  // Check if user has access to this salon
  if (salon.slug !== slug) {
    redirect(`/${salon.slug}/dashboard`)
  }

  // Get settings for theme
  const { data: settings } = await supabase
    .from('salon_settings')
    .select('theme')
    .eq('salon_id', salon.id)
    .maybeSingle()

  const typedSettings = settings as SalonThemeSettings | null
  const themeKey = typedSettings?.theme || 'beauty_salon'

  return (
    <ThemeProvider themeKey={themeKey}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar salonSlug={slug} userName={typedProfile?.full_name ?? undefined} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Navbar salonName={salon.name} />

          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
