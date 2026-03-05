'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

interface Field {
  id: string
  type: 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'date' | 'signature' | 'section_header' | 'photo_upload'
  label: string
  required?: boolean
  options?: string[]
  placeholder?: string
}

interface Template {
  name: string
  fields: Field[]
  gdpr_consent_text?: string
}

interface FormData {
  template: Template
  clientName: string
  salonName: string
}

export default function PublicFormPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const res = await fetch(`/api/forms/public/${token}`)
        if (res.status === 404) {
          setError('Formularz nie istnieje')
          return
        }
        if (res.status === 410) {
          setError('Link wygasł lub formularz został już wypełniony')
          return
        }
        if (!res.ok) throw new Error('Błąd serwera')
        
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError('Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.')
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchForm()
  }, [token])

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY
    
    return {
      x: (clientX - rect.left) * (canvas.width / canvas.offsetWidth),
      y: (clientY - rect.top) * (canvas.height / canvas.offsetHeight)
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#000'
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!data) return false

    data.template.fields.forEach(field => {
      if (field.required && field.type !== 'section_header') {
        const val = answers[field.id]
        if (!val || (Array.isArray(val) && val.length === 0)) {
          newErrors[field.id] = 'To pole jest wymagane'
        }
      }
    })

    if (data.template.gdpr_consent_text && !answers.gdpr_consent) {
      newErrors.gdpr_consent = 'Zgoda jest wymagana'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      const firstError = document.querySelector('[data-error="true"]')
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSubmitting(true)
    try {
      let signatureBase64 = ''
      if (canvasRef.current) {
        const canvas = canvasRef.current
        const blank = document.createElement('canvas')
        blank.width = canvas.width
        blank.height = canvas.height
        if (canvas.toDataURL() !== blank.toDataURL()) {
          signatureBase64 = canvas.toDataURL('image/png')
        }
      }

      const res = await fetch(`/api/forms/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          answers, 
          signature: signatureBase64 || undefined 
        })
      })

      if (res.ok) {
        setSubmitted(true)
      } else {
        const err = await res.json()
        alert(err.message || 'Wystąpił błąd podczas wysyłania.')
      }
    } catch (err) {
      alert('Błąd połączenia. Spróbuj ponownie.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center font-sans">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{error}</h1>
        <p className="text-gray-600">Skontaktuj się z salonem, aby otrzymać nowy link.</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4 text-center font-sans">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Formularz wypełniony!</h1>
        <p className="text-xl text-gray-600">Do zobaczenia w salonie.</p>
      </div>
    )
  }

  const totalFields = data?.template.fields.filter(f => f.type !== 'section_header').length || 0
  const filledFields = Object.keys(answers).filter(k => answers[k] && k !== 'gdpr_consent').length
  const progress = totalFields > 0 ? (filledFields / totalFields) * 100 : 0

  return (
    <div className="min-h-screen bg-gray-50 pb-12 font-sans text-gray-900">
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold truncate">{data?.salonName}</h1>
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${Math.min(progress, 100)}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 text-right font-semibold uppercase tracking-wider">Postęp: {Math.round(progress)}%</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-10">
          <div className="mb-10">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">{data?.template.name}</h2>
            <p className="text-gray-500 text-lg leading-relaxed italic border-l-4 border-blue-500 pl-4">
              Witaj <span className="text-gray-900 font-bold">{data?.clientName}</span>, prosimy o rzetelne wypełnienie poniższego formularza.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-12">
            {data?.template.fields.map((field) => (
              <div key={field.id} className="space-y-4" data-error={!!errors[field.id]}>
                {field.type === 'section_header' ? (
                  <div className="pt-8 border-t border-gray-100 mt-8 first:mt-0 first:pt-0 first:border-0">
                    <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest">{field.label}</h3>
                  </div>
                ) : (
                  <>
                    <label className="block text-xl font-bold text-gray-900 leading-tight">
                      {field.label} {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {field.type === 'text' && (
                      <input
                        type="text"
                        placeholder={field.placeholder || 'Twoja odpowiedź...'}
                        className="w-full px-5 py-4 text-lg border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all bg-gray-50/50 focus:bg-white placeholder:text-gray-300"
                        value={answers[field.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      />
                    )}

                    {field.type === 'textarea' && (
                      <textarea
                        placeholder={field.placeholder || 'Twoja odpowiedź...'}
                        rows={4}
                        className="w-full px-5 py-4 text-lg border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all bg-gray-50/50 focus:bg-white placeholder:text-gray-300 resize-none"
                        value={answers[field.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      />
                    )}

                    {field.type === 'select' && (
                      <select
                        className="w-full px-5 py-4 text-lg border-2 border-gray-100 rounded-2xl bg-gray-50/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all focus:bg-white appearance-none cursor-pointer"
                        value={answers[field.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      >
                        <option value="">Wybierz opcję...</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    )}

                    {field.type === 'radio' && (
                      <div className="grid gap-4">
                        {field.options?.map(opt => (
                          <label key={opt} className={`flex items-center space-x-4 p-5 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md ${answers[field.id] === opt ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100' : 'border-gray-50 bg-gray-50/30'}`}>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${answers[field.id] === opt ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                              {answers[field.id] === opt && <div className="w-2.5 h-2.5 bg-white rounded-full"></div>}
                            </div>
                            <input
                              type="radio"
                              name={field.id}
                              value={opt}
                              className="hidden"
                              checked={answers[field.id] === opt}
                              onChange={() => setAnswers({ ...answers, [field.id]: opt })}
                            />
                            <span className={`text-lg font-medium ${answers[field.id] === opt ? 'text-blue-900' : 'text-gray-600'}`}>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {field.type === 'checkbox' && (
                      <div className="grid gap-4">
                        {field.options && field.options.length > 0 ? (
                          field.options.map(opt => (
                            <label key={opt} className={`flex items-center space-x-4 p-5 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md ${(answers[field.id] || []).includes(opt) ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100' : 'border-gray-50 bg-gray-50/30'}`}>
                              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${(answers[field.id] || []).includes(opt) ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                                {(answers[field.id] || []).includes(opt) && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                value={opt}
                                className="hidden"
                                checked={(answers[field.id] || []).includes(opt)}
                                onChange={(e) => {
                                  const current = answers[field.id] || []
                                  const next = e.target.checked 
                                    ? [...current, opt]
                                    : current.filter((v: string) => v !== opt)
                                  setAnswers({ ...answers, [field.id]: next })
                                }}
                              />
                              <span className={`text-lg font-medium ${(answers[field.id] || []).includes(opt) ? 'text-blue-900' : 'text-gray-600'}`}>{opt}</span>
                            </label>
                          ))
                        ) : (
                          <label className={`flex items-center space-x-4 p-5 border-2 rounded-2xl cursor-pointer transition-all hover:shadow-md ${answers[field.id] ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100' : 'border-gray-50 bg-gray-50/30'}`}>
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${answers[field.id] ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                              {answers[field.id] && (
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={!!answers[field.id]}
                              onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.checked })}
                            />
                            <span className={`text-lg font-medium ${answers[field.id] ? 'text-blue-900' : 'text-gray-600'}`}>Tak / Potwierdzam</span>
                          </label>
                        )}
                      </div>
                    )}

                    {field.type === 'date' && (
                      <input
                        type="date"
                        className="w-full px-5 py-4 text-lg border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 outline-none transition-all bg-gray-50/50 focus:bg-white"
                        value={answers[field.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [field.id]: e.target.value })}
                      />
                    )}

                    {field.type === 'photo_upload' && (
                      <div className="space-y-4">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id={`file-${field.id}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onloadend = () => {
                                setAnswers({ ...answers, [field.id]: reader.result as string })
                              }
                              reader.readAsDataURL(file)
                            }
                          }}
                        />
                        <label 
                          htmlFor={`file-${field.id}`}
                          className="flex flex-col items-center justify-center border-4 border-dashed border-gray-100 rounded-3xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                        >
                          {answers[field.id] ? (
                            <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-lg">
                              <img src={answers[field.id]} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-all">
                                <span className="text-white font-black text-xl tracking-wide uppercase">Zmień zdjęcie</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300">
                                <svg className="w-10 h-10 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </div>
                              <span className="text-gray-400 font-bold text-lg group-hover:text-blue-600">Kliknij, aby dodać zdjęcie</span>
                              <p className="text-gray-300 text-sm mt-2">JPG, PNG lub GIF</p>
                            </>
                          )}
                        </label>
                      </div>
                    )}

                    {field.type === 'signature' && (
                      <div className="space-y-4">
                        <div className="border-4 border-gray-100 rounded-3xl bg-gray-50/50 overflow-hidden relative shadow-inner">
                          <canvas
                            ref={canvasRef}
                            width={800}
                            height={400}
                            className="w-full h-auto cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                          />
                        </div>
                        <div className="flex justify-between items-center px-2">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <p className="text-xs text-gray-400 font-black uppercase tracking-widest">Podpis klienta</p>
                          </div>
                          <button
                            type="button"
                            onClick={clearCanvas}
                            className="text-sm font-black text-blue-600 hover:text-red-600 transition-colors py-2 px-5 bg-blue-50 hover:bg-red-50 rounded-xl uppercase tracking-tighter"
                          >
                            Wyczyść
                          </button>
                        </div>
                      </div>
                    )}

                    {errors[field.id] && (
                      <div className="flex items-center space-x-2 text-red-600 animate-bounce mt-1">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-black">{errors[field.id]}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {data?.template.gdpr_consent_text && (
              <div className="pt-12 border-t border-gray-100 space-y-5">
                <label className={`flex items-start space-x-5 p-6 border-2 rounded-3xl cursor-pointer transition-all hover:shadow-lg ${answers.gdpr_consent ? 'border-blue-600 bg-blue-50/50' : 'border-gray-50 bg-gray-50/20'}`}>
                  <div className={`mt-1 w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${answers.gdpr_consent ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                    {answers.gdpr_consent && (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={!!answers.gdpr_consent}
                    onChange={(e) => setAnswers({ ...answers, gdpr_consent: e.target.checked })}
                  />
                  <span className={`text-sm md:text-base leading-relaxed font-medium ${answers.gdpr_consent ? 'text-blue-950' : 'text-gray-500'}`}>
                    {data.template.gdpr_consent_text}
                  </span>
                </label>
                {errors.gdpr_consent && (
                  <div className="flex items-center space-x-2 text-red-600 px-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-black">{errors.gdpr_consent}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-6">
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-6 px-8 rounded-3xl text-2xl font-black text-white transition-all shadow-2xl hover:shadow-blue-500/40 active:scale-[0.96] flex items-center justify-center space-x-4 uppercase tracking-widest ${
                  submitting 
                    ? 'bg-gray-400 cursor-not-allowed translate-y-1 shadow-none' 
                    : 'bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800'
                }`}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Wysyłanie...</span>
                  </>
                ) : (
                  <>
                    <span>Wyślij formularz</span>
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
      
      <footer className="max-w-2xl mx-auto px-4 mt-12 mb-8 text-center">
        <div className="flex flex-col items-center space-y-3 opacity-30 hover:opacity-100 transition-opacity duration-700">
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.4em]">Zaszyfrowane i bezpieczne połączenie</p>
          <div className="flex items-center space-x-2 text-gray-500">
            <span className="text-xs font-black italic">powered by</span>
            <span className="text-sm font-extrabold tracking-tight">SimpliSalon</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
