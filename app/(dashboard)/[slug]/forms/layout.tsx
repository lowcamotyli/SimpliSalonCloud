import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import React from 'react'

interface FormsLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function FormsLayout({
  children,
  params,
}: FormsLayoutProps) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profileResult = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  const profile = profileResult.data as { role: string } | null

  if (profile?.role === 'employee') {
    redirect(`/${slug}/dashboard`)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-8 px-4 sm:px-0">
      {children}
    </div>
  )
}
