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
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-7">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Ustawienia salonu</div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Ustawienia
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Zarządzaj konfiguracją salonu
        </p>
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
        <SettingsNav baseUrl={baseUrl} />
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
