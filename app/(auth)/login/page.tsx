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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Get user's salon (use specific FK to avoid ambiguity with deleted_by)
      const { data: profile } = await supabase
        .from('profiles')
        .select('salon_id, salons!profiles_salon_id_fkey(slug)')
        .eq('user_id', data.user.id)
        .single()

      if (!profile) {
        throw new Error('Profil użytkownika nie został znaleziony')
      }

      // @ts-ignore - TS doesn't know about nested select
      const salonSlug = profile.salons?.slug

      toast.success('Zalogowano pomyślnie')
      router.push(`/${salonSlug}/dashboard`)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Błąd logowania')
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
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="twoj@email.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Hasło</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
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