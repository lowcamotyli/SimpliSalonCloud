import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/navbar'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { MobileNavProvider } from '@/components/layout/mobile-nav-context'
import { DashboardCommandPalette } from '@/components/layout/dashboard-command-palette'
import { ThemeKey } from '@/lib/types/settings'
import DunningBanner from '@/components/billing/DunningBanner'

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
      <MobileNavProvider>
      <div className="theme-dashboard-shell flex h-screen overflow-hidden bg-[var(--v3-bg)] text-[var(--v3-text-primary)] [&_.theme-navbar]:!border-[var(--v3-border)] [&_.theme-navbar]:!bg-[var(--v3-surface)] [&_.theme-navbar]:!shadow-none [&_.theme-navbar]:!backdrop-blur-none [&_.theme-sidebar]:!w-56 [&_.theme-sidebar]:!border-[var(--v3-border)] [&_.theme-sidebar]:!bg-[var(--v3-bg-alt)] [&_.theme-sidebar]:!shadow-none">
        <DashboardCommandPalette salonSlug={slug} />
        <Sidebar salonSlug={slug} userName={typedProfile?.full_name ?? undefined} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <Navbar salonName={salon.name} salonSlug={slug} />

          <main className="theme-dashboard-main flex-1 overflow-y-auto bg-[var(--v3-bg)] p-4 md:px-7 md:py-6">
            <DunningBanner salonId={salon.id} slug={slug} />
            {children}
          </main>
        </div>
      </div>
      </MobileNavProvider>
    </ThemeProvider>
  )
}
