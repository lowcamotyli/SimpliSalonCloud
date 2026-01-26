import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/navbar'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { ThemeKey } from '@/lib/types/settings'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const supabase = await createServerSupabaseClient()

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Get user's salon
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      salon_id,
      role,
      full_name,
      salons (
        id,
        slug,
        name
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  // @ts-ignore
  const salon = profile.salons

  // Check if user has access to this salon
  if (salon.slug !== params.slug) {
    redirect(`/${salon.slug}/dashboard`)
  }

  // Get settings for theme
  const { data: settings } = await supabase
    .from('salon_settings')
    .select('theme')
    .eq('salon_id', salon.id)
    .maybeSingle()

  const themeKey = (settings?.theme as ThemeKey) || 'beauty_salon'

  return (
    <ThemeProvider themeKey={themeKey}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar salonSlug={params.slug} userName={profile?.full_name} />

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