import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import React from 'react'

interface SettingsLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function SettingsLayout({
  children,
  params,
}: SettingsLayoutProps) {
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

  // Employee has no access to settings at all
  if (profile?.role === 'employee') {
    redirect(`/${slug}/dashboard`)
  }

  return <>{children}</>
}
