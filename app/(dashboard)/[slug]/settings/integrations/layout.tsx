import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function IntegrationsSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileResult = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single()
  const profile = profileResult.data as { role: string } | null

  if (profile?.role !== 'owner') redirect(`/${slug}/settings`)

  return <>{children}</>
}
