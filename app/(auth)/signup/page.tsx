'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    salonName: '',
    salonSlug: '',
  })
  const [loading, setLoading] = useState(false)

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    
    // Auto-generate slug from salon name
    if (field === 'salonName') {
      const slug = e.target.value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      setFormData(prev => ({ ...prev, salonSlug: slug }))
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validation
      if (formData.password !== formData.confirmPassword) {
        throw new Error('Hasła nie są identyczne')
      }

      if (formData.password.length < 6) {
        throw new Error('Hasło musi mieć minimum 6 znaków')
      }

      if (!formData.salonSlug) {
        throw new Error('Nazwa salonu jest wymagana')
      }

      const supabase = createClient()

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Nie udało się utworzyć użytkownika')

      // 2. Create salon
      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .insert({
          slug: formData.salonSlug,
          name: formData.salonName,
          owner_email: formData.email,
        })
        .select()
        .single()

      if (salonError) throw salonError

      // 3. Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authData.user.id,
          salon_id: salonData.id,
          full_name: formData.fullName,
          role: 'owner',
        })

      if (profileError) throw profileError

      toast.success('Konto zostało utworzone! Sprawdź email w celu weryfikacji.')
      
      // Redirect to login
      router.push('/login')
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas rejestracji')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">SimpliSalon</h1>
        <p className="mt-2 text-gray-600">Utwórz konto dla swojego salonu</p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Imię i nazwisko</Label>
          <Input
            id="fullName"
            value={formData.fullName}
            onChange={handleChange('fullName')}
            placeholder="Jan Kowalski"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            placeholder="twoj@email.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Hasło</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={handleChange('password')}
            placeholder="••••••••"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Potwierdź hasło</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange('confirmPassword')}
            placeholder="••••••••"
            required
          />
        </div>

        <div className="border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="salonName">Nazwa salonu</Label>
            <Input
              id="salonName"
              value={formData.salonName}
              onChange={handleChange('salonName')}
              placeholder="Salon Piękności"
              required
            />
          </div>

          <div className="mt-2 space-y-2">
            <Label htmlFor="salonSlug">Adres URL salonu</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">simplisalon.pl/</span>
              <Input
                id="salonSlug"
                value={formData.salonSlug}
                onChange={handleChange('salonSlug')}
                placeholder="moj-salon"
                required
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Tworzenie konta...' : 'Utwórz konto'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="text-blue-600 hover:text-blue-700 hover:underline"
        >
          Masz już konto? Zaloguj się
        </Link>
      </div>
    </div>
  )
}