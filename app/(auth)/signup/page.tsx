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
  const [errorDetails, setErrorDetails] = useState<Record<string, string>>({})

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    // Wyczyść błąd dla danego pola, gdy użytkownik zaczyna pisać
    setErrorDetails(prev => ({ ...prev, [field]: '', general: '' }))

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
    setErrorDetails({}) // Reset błędów na starcie
    let hasValidationError = false
    const newErrors: Record<string, string> = {}

    try {
      // Validation Front-end
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Hasła nie są identyczne'
        hasValidationError = true
      }

      if (formData.password.length < 6) {
        newErrors.password = 'Hasło musi mieć minimum 6 znaków'
        hasValidationError = true
      }

      if (!formData.salonSlug) {
        newErrors.salonSlug = 'Adres URL salonu jest wymagany'
        hasValidationError = true
      }

      if (hasValidationError) {
        setErrorDetails(newErrors)
        throw new Error('Popraw błędy w formularzu przed kontynuacją')
      }

      const supabase = createClient()

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      })

      if (authError) {
        // Tłumaczenie błędów Supabase Auth
        if (authError.message.includes('already registered') || authError.status === 400) {
          setErrorDetails({ email: 'Konto z podanym adresem email już istnieje' })
          throw new Error('Konto o podanym adresie email już istnieje.')
        }
        throw authError
      }
      if (!authData.user) throw new Error('Nie udało się utworzyć użytkownika')

      // 2. Create salon
      const { data: salonData, error: salonError } = await supabase
        .from('salons')
        .insert({
          slug: formData.salonSlug,
          name: formData.salonName,
          owner_email: formData.email,
        } as any)
        .select()
        .single()

      if (salonError) {
        if (salonError.code === '23505') { // Postgres: unique_violation
          setErrorDetails({ salonSlug: 'Ten URL salonu jest już zajęty' })
          // Wycofujemy autoryzację, zeby zapobiec tworzeniu profilu "ducha" - Wymagałoby dodatkowego RLS, chwilowo zgłaszamy po prostu błąd
          throw new Error('Ten link salonu jest już zajęty, wybierz inny.')
        }
        throw salonError
      }

      // 3. Create profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authData.user.id,
          salon_id: (salonData as any).id,
          full_name: formData.fullName,
          role: 'owner',
        } as any)

      if (profileError) throw profileError

      toast.success('Konto zostało utworzone! Sprawdź email w celu weryfikacji.')

      // Redirect to login
      router.push('/login')
    } catch (error: any) {
      toast.error(error.message || 'Błąd podczas rejestracji')
      if (!Object.keys(newErrors).length && !errorDetails.email && !errorDetails.salonSlug) {
        setErrorDetails(prev => ({ ...prev, general: error.message || 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.' }))
      }
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
        {errorDetails.general && (
          <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
            {errorDetails.general}
          </div>
        )}
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
          <Label htmlFor="email" className={errorDetails.email ? "text-red-500" : ""}>Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            placeholder="twoj@email.com"
            required
            className={errorDetails.email ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errorDetails.email && <p className="text-sm text-red-500 mt-1">{errorDetails.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={errorDetails.password ? "text-red-500" : ""}>Hasło</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={handleChange('password')}
            placeholder="••••••••"
            required
            className={errorDetails.password ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errorDetails.password && <p className="text-sm text-red-500 mt-1">{errorDetails.password}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className={errorDetails.confirmPassword ? "text-red-500" : ""}>Potwierdź hasło</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange('confirmPassword')}
            placeholder="••••••••"
            required
            className={errorDetails.confirmPassword ? "border-red-500 focus-visible:ring-red-500" : ""}
          />
          {errorDetails.confirmPassword && <p className="text-sm text-red-500 mt-1">{errorDetails.confirmPassword}</p>}
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
            <Label htmlFor="salonSlug" className={errorDetails.salonSlug ? "text-red-500" : ""}>Adres URL salonu</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">simplisalon.pl/</span>
              <Input
                id="salonSlug"
                value={formData.salonSlug}
                onChange={handleChange('salonSlug')}
                placeholder="moj-salon"
                required
                className={errorDetails.salonSlug ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
            </div>
            {errorDetails.salonSlug && <p className="text-sm text-red-500 mt-1">{errorDetails.salonSlug}</p>}
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