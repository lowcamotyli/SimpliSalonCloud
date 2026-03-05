'use client'

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"

interface SurveyData {
  salon_name: string
  is_completed: boolean
  is_expired: boolean
}

export default function SurveyPage(): JSX.Element {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SurveyData | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitted, setSubmitted] = useState<boolean>(false)

  const [rating, setRating] = useState<number>(0)
  const [npsScore, setNpsScore] = useState<number | null>(null)
  const [comment, setComment] = useState<string>("")

  useEffect(() => {
    async function fetchSurvey() {
      try {
        const res = await fetch(`/api/surveys/fill/${token}`)
        if (!res.ok) {
          if (res.status === 404) throw new Error("Ankieta nie istnieje.")
          if (res.status === 410) throw new Error("Ankieta wygasła.")
          throw new Error("Wystąpił błąd podczas ładowania ankiety.")
        }
        const surveyData: SurveyData = await res.json()
        
        if (surveyData.is_completed) {
          setSubmitted(true)
        }
        
        setData(surveyData)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchSurvey()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/surveys/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          nps_score: npsScore,
          comment
        }),
      })

      if (!res.ok) throw new Error("Nie udało się przesłać opinii.")
      setSubmitted(true)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Błąd</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm text-center">
          <div className="text-green-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Dziękujemy!</h1>
          <p className="text-gray-600">Twoja opinia jest dla nas ważna.</p>
        </div>
      </div>
    )
  }

  const getNpsColor = (score: number) => {
    if (score <= 6) return npsScore === score ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
    if (score <= 8) return npsScore === score ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
    return npsScore === score ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm">
        <header className="text-center mb-8">
          <p className="text-sm font-medium text-blue-600 tracking-wide uppercase mb-1">{data?.salon_name}</p>
          <h1 className="text-2xl font-bold text-gray-900">Jak oceniasz dzisiejszą wizytę?</h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Star Rating */}
          <div className="flex justify-center space-x-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="focus:outline-none transition-transform active:scale-95"
              >
                <svg
                  className={`w-12 h-12 ${rating >= star ? "text-yellow-400 fill-current" : "text-gray-300 fill-none"}`}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
            ))}
          </div>

          {/* NPS Question */}
          <div className="space-y-4">
            <p className="text-center font-medium text-gray-700">Czy poleciłbyś nas znajomym?</p>
            <div className="grid grid-cols-6 sm:grid-cols-11 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setNpsScore(score)}
                  className={`h-10 text-sm font-bold rounded transition-colors ${getNpsColor(score)}`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 uppercase tracking-tighter">
              <span>Wcale nie</span>
              <span>Zdecydowanie tak</span>
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700">
              Co moglibyśmy zrobić lepiej? (opcjonalnie)
            </label>
            <textarea
              id="comment"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm outline-none transition-all"
              placeholder="Twoja opinia..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={rating === 0 || submitting}
            className={`w-full py-3 px-4 rounded-md font-bold text-white transition-all ${
              rating === 0 || submitting
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-md"
            }`}
          >
            {submitting ? "Przesyłanie..." : "Prześlij ocenę"}
          </button>
        </form>
      </div>
    </div>
  )
}
