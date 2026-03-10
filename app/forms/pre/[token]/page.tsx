'use client'

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"

interface FormField {
  id: string
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'date' | 'section_header'
  label: string
  required?: boolean
  options?: string[]
  helpText?: string
}

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
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const fetchData = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/forms/pre/${token}`)
      
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
        // Initialize answers for checkboxes as empty arrays
        const initialAnswers: Record<string, string | string[]> = {}
        data.template.fields.forEach((field: FormField) => {
          if (field.type === 'checkbox') {
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
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const validate = (): boolean => {
    if (!formData) return false
    const errors: Record<string, string> = {}
    
    formData.template.fields.forEach((field) => {
      if (field.type === 'section_header') return
      
      const answer = answers[field.id]
      const isRequired = field.required

      if (isRequired) {
        if (field.type === 'checkbox') {
          if (!Array.isArray(answer) || answer.length === 0) {
            errors[field.id] = "To pole jest wymagane."
          }
        } else {
          if (!answer || (typeof answer === 'string' && answer.trim() === '')) {
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
      const res = await fetch(`/api/forms/pre/${token}`, {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin border-4 border-gray-200 border-t-green-500 rounded-full w-8 h-8"></div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Formularz wysłany!</h1>
          <p className="text-gray-600">Dziękujemy! Twoje odpowiedzi zostały zapisane. Do zobaczenia na wizycie.</p>
        </div>
      </div>
    )
  }

  if (status === 'already_submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Formularz już wysłany</h1>
          <p className="text-gray-600">Dziękujemy za wypełnienie formularza przed wizytą.</p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">✕</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link wygasł</h1>
          <p className="text-gray-600">Ten link jest nieważny lub wygasł.</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Wystąpił błąd</h1>
          <p className="text-gray-600">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    )
  }

  if (!formData) return <div className="p-4 text-center">Brak danych formularza.</div>

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-white">
          <h2 className="text-xl font-bold text-gray-900">{formData.salonName}</h2>
          <h1 className="text-lg font-medium text-gray-700 mt-1">Formularz przed wizytą</h1>
          {formData.clientName && (
            <p className="mt-4 text-gray-800">Cześć, <span className="font-semibold">{formData.clientName}</span>!</p>
          )}
          <p className="text-gray-600 mt-1">Prosimy o wypełnienie krótkiego formularza przed wizytą.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {formData.template.fields.map((field) => (
            <div key={field.id} className="space-y-2">
              {field.type === 'section_header' ? (
                <div className="pt-4">
                  <h3 className="text-lg font-bold text-gray-900">{field.label}</h3>
                  <hr className="mt-2 border-gray-200" />
                </div>
              ) : (
                <>
                  <label className="block font-bold text-gray-900">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  
                  {field.helpText && (
                    <p className="text-gray-500 text-sm italic">{field.helpText}</p>
                  )}

                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-green-500 outline-none transition-all ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      rows={3}
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-green-500 outline-none transition-all ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  )}

                  {field.type === 'date' && (
                    <input
                      type="date"
                      value={(answers[field.id] as string) || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-green-500 outline-none transition-all ${
                        validationErrors[field.id] ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  )}

                  {field.type === 'radio' && (
                    <div className="space-y-2 mt-2">
                      {field.options?.map((option) => (
                        <label key={option} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="radio"
                            name={field.id}
                            value={option}
                            checked={answers[field.id] === option}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                          />
                          <span className="text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === 'checkbox' && (
                    <div className="space-y-2 mt-2">
                      {field.options?.map((option) => (
                        <label key={option} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={((answers[field.id] as string[]) || []).includes(option)}
                            onChange={(e) => handleCheckboxChange(field.id, option, e.target.checked)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                          />
                          <span className="text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {validationErrors[field.id] && (
                    <p className="text-red-500 text-sm mt-1">{validationErrors[field.id]}</p>
                  )}
                </>
              )}
            </div>
          ))}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
