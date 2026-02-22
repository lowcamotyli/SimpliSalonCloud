'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

type InviteState = 'loading' | 'ready' | 'error' | 'success'

export default function InvitePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<InviteState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [salonSlug, setSalonSlug] = useState<string | null>(null)

  const handleInvite = useCallback(async () => {
    try {
      if (typeof window === 'undefined') return

      const hash = window.location.hash.replace('#', '')
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        setErrorMessage('Brak tokenu zaproszenia. Otwórz link z maila ponownie.')
        setState('error')
        return
      }

      await supabase.auth.signOut()

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        setErrorMessage(sessionError.message)
        setState('error')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('salon_id, salons!profiles_salon_id_fkey(slug)')
        .single()

      if (profileError) {
        setErrorMessage(profileError.message)
        setState('error')
        return
      }

      const profileWithSalon = profile as { salons: { slug: string } | null } | null
      const slug = profileWithSalon?.salons?.slug
      setSalonSlug(slug || null)
      setState('ready')
    } catch (error: any) {
      setErrorMessage(error?.message || 'Nie udało się przetworzyć zaproszenia')
      setState('error')
    }
  }, [supabase])

  useEffect(() => {
    void handleInvite()
  }, [handleInvite])

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault()

    if (password.length < 8) {
      toast.error('Hasło musi mieć minimum 8 znaków')
      return
    }

    if (password !== passwordConfirm) {
      toast.error('Hasła nie są takie same')
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
      return
    }

    if (!salonSlug) {
      toast.error('Nie znaleziono salonu dla użytkownika')
      return
    }

    setState('success')
    toast.success('Hasło ustawione')
    window.location.href = `/${salonSlug}/dashboard`
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Akceptuj zaproszenie</h1>
        <p className="mt-2 text-gray-600">Ustaw hasło, aby aktywować konto</p>
      </div>

      {state === 'loading' && (
        <Card>
          <CardContent className="py-10 text-center">Ładowanie zaproszenia...</CardContent>
        </Card>
      )}

      {state === 'error' && (
        <Card>
          <CardContent className="py-10 text-center text-red-600">
            {errorMessage || 'Wystąpił błąd'}
          </CardContent>
        </Card>
      )}

      {state === 'ready' && (
        <form onSubmit={handleSetPassword} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="passwordConfirm">Powtórz hasło</Label>
            <Input
              id="passwordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full">
            Ustaw hasło
          </Button>
        </form>
      )}

      {state === 'success' && (
        <Card>
          <CardContent className="py-10 text-center">Przekierowanie...</CardContent>
        </Card>
      )}
    </div>
  )
}
