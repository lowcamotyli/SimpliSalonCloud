'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
    setErrorDetails({})

    const newErrors: Record<string, string> = {}
    let hasValidationError = false

    try {
      // Client-side validation only
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
        return
      }

      // All DB operations are delegated to the server-side API route
      // which assigns role: 'owner' internally — no client-side trust
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          salonName: formData.salonName,
          salonSlug: formData.salonSlug,
        }),
      })

      if (!res.ok) {
        const data = await res.json()

        if (res.status === 409 && data.field === 'email') {
          setErrorDetails({ email: 'Konto z podanym adresem email już istnieje' })
          toast.error('Konto o podanym adresie email już istnieje.')
          return
        }

        if (res.status === 409 && data.field === 'salonSlug') {
          setErrorDetails({ salonSlug: 'Ten URL salonu jest już zajęty' })
          toast.error('Ten link salonu jest już zajęty, wybierz inny.')
          return
        }

        if (res.status === 400 && data.details) {
          // Zod validation errors from server
          const fieldErrors = data.details as Record<string, string[]>
          const mapped: Record<string, string> = {}
          for (const [field, msgs] of Object.entries(fieldErrors)) {
            if (Array.isArray(msgs) && msgs.length > 0) {
              mapped[field] = msgs[0]
            }
          }
          setErrorDetails(mapped)
          toast.error('Popraw błędy w formularzu.')
          return
        }

        throw new Error(data.error || 'Błąd podczas rejestracji')
      }

      toast.success('Konto zostało utworzone! Sprawdź email w celu weryfikacji.')
      router.push('/login')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.'
      toast.error(message)
      setErrorDetails(prev => ({ ...prev, general: message }))
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