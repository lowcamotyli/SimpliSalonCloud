'use client'

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import type { FormField } from "@/types/forms"
import { isFieldVisible, isValuePresent } from "@/lib/forms/field-visibility"

type AnswerValue = string | string[] | boolean

interface FormData {
  template: {
    name: string
    fields: FormField[]
    requires_signature: boolean
  }
  clientName: string | null
  salonName: string
  bookingId: string
}

type Status = 'loading' | 'ready' | 'already_submitted' | 'expired' | 'error' | 'submitting' | 'success'

export default function PreAppointmentFormPage(): JSX.Element {
  const params = useParams()
  const token = params.token as string

  const [status, setStatus] = useState<Status>('loading')
  const [formData, setFormData] = useState<FormData | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const bypassSuffix =
    typeof window !== "undefined"
      ? (() => {
          const bypass = new URLSearchParams(window.location.search).get("x-vercel-protection-bypass")
          return bypass ? `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}` : ""
        })()
      : ""

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/forms/pre/${token}${bypassSuffix}`)
      
      if (res.status === 410) {
        setStatus('expired')
        return
      }

      const data = await res.json()

      if (data.alreadySubmitted) {
        setStatus('already_submitted')
        return
      }

      if (res.ok) {
        setFormData(data)
        const initialAnswers: Record<string, AnswerValue> = {}
        data.template.fields.forEach((field: FormField) => {
          if (field.type === 'checkbox' && field.options?.length) {
            initialAnswers[field.id] = []
          }
        })
        setAnswers(initialAnswers)
        setStatus('ready')
      } else {
        setError(data.error || "Wystąpił błąd podczas ładowania formularza.")
        setStatus('error')
      }
    } catch (err) {
      setError("Nie udało się połączyć z serwerem.")
      setStatus('error')
    }
  }, [token, bypassSuffix])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const validate = (): boolean => {
    if (!formData) return false
    const errors: Record<string, string> = {}
    const visibleFields = formData.template.fields.filter((field) =>
      isFieldVisible(field, answers)
    )
    
    visibleFields.forEach((field) => {
      if (field.type === 'section_header') return
      
      const answer = answers[field.id]
      const isRequired = field.required

      if (isRequired) {
        if (field.type === 'checkbox' && field.options?.length) {
          if (!Array.isArray(answer) || answer.length === 0) {
            errors[field.id] = "To pole jest wymagane."
          }
        } else {
          if (!isValuePresent(answer)) {
            errors[field.id] = "To pole jest wymagane."
          }
        }
      }
    })

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setStatus('submitting')
    try {
      const res = await fetch(`/api/forms/pre/${token}${bypassSuffix}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      })

      if (res.ok) {
        setStatus('success')
      } else if (res.status === 409) {
        setStatus('already_submitted')
      } else if (res.status === 410) {
        setStatus('expired')
      } else {
        const data = await res.json()
        setError(data.error || "Wystąpił błąd podczas wysyłania.")
        setStatus('ready')
      }
    } catch (err) {
      setError("Błąd połączenia. Spróbuj ponownie.")
      setStatus('ready')
    }
  }

  const handleInputChange = (id: string, value: string): void => {
    setAnswers(prev => ({ ...prev, [id]: value }))
    if (validationErrors[id]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const handleBooleanChange = (id: string, checked: boolean): void => {
    setAnswers(prev => ({ ...prev, [id]: checked }))

    if (validationErrors[id]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const handleCheckboxChange = (id: string, option: string, checked: boolean): void => {
    setAnswers(prev => {
      const current = (prev[id] as string[]) || []
      const next = checked 
        ? [...current, option]
        : current.filter(o => o !== option)
      return { ...prev, [id]: next }
    })
    
    if (validationErrors[id]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-blue-600"></div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-6xl text-emerald-600">✓</div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Formularz wysłany!</h1>
          <p className="text-neutral-600">Dziękujemy! Twoje odpowiedzi zostały zapisane. Do zobaczenia na wizycie.</p>
        </div>
      </div>
    )
  }

  if (status === 'already_submitted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-6xl text-emerald-600">✓</div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Formularz już wysłany</h1>
          <p className="text-neutral-600">Dziękujemy za wypełnienie formularza przed wizytą.</p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-6xl text-red-600">✕</div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Link wygasł</h1>
          <p className="text-neutral-600">Ten link jest nieważny lub wygasł.</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-6xl text-red-600">!</div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Wystąpił błąd</h1>
          <p className="text-neutral-600">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    )
  }

  if (!formData) return <div className="p-4 text-center">Brak danych formularza.</div>

  const visibleFields = formData.template.fields.filter((field) =>
    isFieldVisible(field, answers)
  )

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 p-6">
          <h2 className="text-xl font-bold text-neutral-900">{formData.salonName}</h2>
          <h1 className="mt-1 text-lg font-medium text-neutral-700">Formularz przed wizytą</h1>
          {formData.clientName && (
            <p className="mt-4 text-neutral-800">Cześć, <span className="font-semibold">{formData.clientName}</span>!</p>
          )}
          <p className="mt-1 text-neutral-600">Prosimy o wypełnienie krótkiego formularza przed wizytą.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 p-6 md:p-8">
          {visibleFields.map((field) => (
            <div key={field.id} className="space-y-3">
              {field.type === 'section_header' ? (
                <div className="mt-8 border-t border-neutral-200 pt-8 first:mt-0 first:border-0 first:pt-0">
                  <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-500">{field.label}</h3>
                </div>
              ) : (
                <>
                  <label className="block text-sm font-semibold text-neutral-800">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  
                  {field.helpText && (
                    <p className="text-xs text-neutral-500">{field.helpText}</p>
                  )}

                  {field.type === 'text' && (
                    <input
                      type="text"
                      placeholder={field.placeholder || 'Twoja odpowiedz...'}
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-neutral-300'
                      }`}
                    />
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      rows={3}
                      placeholder={field.placeholder || 'Twoja odpowiedz...'}
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`min-h-[96px] w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-neutral-300'
                      }`}
                    />
                  )}

                  {field.type === 'select' && (
                    <select
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-neutral-300'
                      }`}
                    >
                      <option value="">Wybierz opcje...</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === 'date' && (
                    <input
                      type="date"
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-neutral-300'
                      }`}
                    />
                  )}

                  {field.type === 'radio' && (
                    <div className="mt-2 grid gap-2">
                      {field.options?.map((option) => (
                        <label key={option} className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
                          <input
                            type="radio"
                            name={field.id}
                            value={option}
                            checked={answers[field.id] === option}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="h-4 w-4 border-neutral-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-neutral-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === 'checkbox' && (
                    <div className="mt-2 grid gap-2">
                      {field.options?.length ? (
                        field.options.map((option) => (
                          <label key={option} className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={((answers[field.id] as string[]) || []).includes(option)}
                              onChange={(e) => handleCheckboxChange(field.id, option, e.target.checked)}
                              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-neutral-700">{option}</span>
                          </label>
                        ))
                      ) : (
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={Boolean(answers[field.id])}
                            onChange={(e) => handleBooleanChange(field.id, e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-neutral-700">Tak / Potwierdzam</span>
                        </label>
                      )}
                    </div>
                  )}

                  {validationErrors[field.id] && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors[field.id]}</p>
                  )}
                </>
              )}
            </div>
          ))}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'submitting' ? (
              <>
                <div className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></div>
                <span>Wysyłanie...</span>
              </>
            ) : (
              <span>Wyślij formularz</span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
