'use client'

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

interface SurveyPayload {
  survey?: {
    id: string
    booking_id: string
  }
  salon?: {
    name: string
  }
  alreadyFilled?: boolean
}

export default function SurveyPage(): JSX.Element {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [salonName, setSalonName] = useState<string>("")
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitted, setSubmitted] = useState<boolean>(false)

  const [rating, setRating] = useState<number>(0)
  const [npsScore, setNpsScore] = useState<number | null>(null)
  const [comment, setComment] = useState<string>("")

  const bypassSuffix =
    typeof window !== "undefined"
      ? (() => {
          const bypass = new URLSearchParams(window.location.search).get("x-vercel-protection-bypass")
          return bypass ? `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}` : ""
        })()
      : ""

  useEffect(() => {
    async function fetchSurvey() {
      try {
        const res = await fetch(`/api/surveys/fill/${token}${bypassSuffix}`)

        if (!res.ok) {
          if (res.status === 404) throw new Error("Ankieta nie istnieje.")
          if (res.status === 410) throw new Error("Ankieta wygasla.")
          throw new Error("Wystapil blad podczas ladowania ankiety.")
        }

        const surveyData = await res.json() as SurveyPayload

        if (surveyData.alreadyFilled) {
          setSubmitted(true)
          return
        }

        setSalonName(surveyData.salon?.name ?? "")
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (token) fetchSurvey()
  }, [token, bypassSuffix])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) return

    setSubmitting(true)

    try {
      const res = await fetch(`/api/surveys/submit/${token}${bypassSuffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          nps_score: npsScore,
          comment,
        }),
      })

      if (!res.ok) throw new Error("Nie udalo sie przeslac opinii.")
      setSubmitted(true)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-red-500">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-bold text-neutral-900">Blad</h1>
          <p className="text-neutral-600">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-green-500">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-neutral-900">Dziekujemy!</h1>
          <p className="text-neutral-600">Twoja opinia jest dla nas wazna.</p>
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <header className="mb-8 text-center">
          <p className="mb-1 text-sm font-medium uppercase tracking-wide text-blue-600">{salonName}</p>
          <h1 className="text-2xl font-bold text-neutral-900">Jak oceniasz dzisiejsza wizyte?</h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex justify-center space-x-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="transition-transform active:scale-95 focus:outline-none"
              >
                <svg
                  className={`h-12 w-12 ${rating >= star ? "fill-current text-yellow-400" : "fill-none text-gray-300"}`}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <p className="text-center font-medium text-neutral-700">Czy polecilbys nas znajomym?</p>
            <div className="grid grid-cols-6 gap-1 sm:grid-cols-11">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setNpsScore(score)}
                  className={`h-10 rounded text-sm font-bold transition-colors ${getNpsColor(score)}`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] uppercase tracking-tighter text-neutral-400">
              <span>Wcale nie</span>
              <span>Zdecydowanie tak</span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="comment" className="block text-sm font-medium text-neutral-700">
              Co moglibysmy zrobic lepiej? (opcjonalnie)
            </label>
            <textarea
              id="comment"
              rows={3}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Twoja opinia..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={rating === 0 || submitting}
            className={`w-full rounded-xl px-4 py-3 font-bold text-white transition-all ${
              rating === 0 || submitting
                ? "cursor-not-allowed bg-gray-300"
                : "bg-blue-600 shadow-md hover:bg-blue-700 active:bg-blue-800"
            }`}
          >
            {submitting ? "Przesylanie..." : "Przeslij ocene"}
          </button>
        </form>
      </div>
    </div>
  )
}
