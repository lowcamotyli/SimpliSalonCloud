import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import React from 'react'
import { SettingsNav } from '@/components/settings/settings-nav'

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

  const baseUrl = `/${slug}/settings`

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-8 px-4 sm:px-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Ustawienia
        </h1>
        <p className="text-muted-foreground text-base">
          Zarządzaj konfiguracją salonu
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <SettingsNav baseUrl={baseUrl} />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
