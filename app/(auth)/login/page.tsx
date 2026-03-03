'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('') // Wyczyść poprzedni błąd

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Tłumaczenie błędu złego hasła/emailu z Supabase
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('Nieprawidłowy adres email lub hasło.')
          throw new Error('Nieprawidłowy adres email lub pole hasło.')
        }
        throw error
      }

      // Get user's salon (use specific FK to avoid ambiguity with deleted_by)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('salon_id, salons!profiles_salon_id_fkey(slug)')
        .eq('user_id', data.user.id)
        .single()

      console.log('Profile query result:', { profile, profileError })

      if (profileError) {
        setErrorMsg('Błąd połączenia z bazą użytkowników.')
        throw profileError
      }

      if (!profile) {
        setErrorMsg('Profil użytkownika nie został odnaleziony.')
        throw new Error('Profil użytkownika nie został odnaleziony')
      }

      // @ts-ignore - TS doesn't know about nested select
      const salonSlug = profile.salons?.slug

      console.log('Salon slug:', salonSlug)
      console.log('Redirecting to:', `/${salonSlug}/dashboard`)

      if (!salonSlug) {
        setErrorMsg('Brak przypisanego salonu do konta.')
        throw new Error('Brak przypisanego salonu do konta')
      }

      toast.success('Zalogowano pomyślnie')

      // Use window.location instead of router.push for more reliable redirect
      window.location.href = `/${salonSlug}/dashboard`
    } catch (error: any) {
      if (!errorMsg) setErrorMsg(error.message || 'Błąd logowania')
      toast.error(errorMsg || error.message || 'Błąd logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">SimpliSalon</h1>
        <p className="mt-2 text-gray-600">Zaloguj się do swojego salonu</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        {errorMsg && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {errorMsg}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email" className={errorMsg ? "text-red-500" : ""}>Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrorMsg('') }}
            placeholder="twoj@email.com"
            required
            autoComplete="email"
            className={errorMsg ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={errorMsg ? "text-red-500" : ""}>Hasło</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrorMsg('') }}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className={errorMsg ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Logowanie...' : 'Zaloguj się'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link
          href="/signup"
          className="text-blue-600 hover:text-blue-700 hover:underline"
        >
          Nie masz konta? Zarejestruj się
        </Link>
      </div>
    </div>
  )
}