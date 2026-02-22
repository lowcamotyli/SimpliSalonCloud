'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error)
    }
  }, [error])

  return (
    <html lang="pl">
      <body className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Wystąpił nieoczekiwany błąd</h2>
          <p className="text-sm text-muted-foreground">
            Błąd został zarejestrowany. Spróbuj odświeżyć widok.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 transition"
          >
            Spróbuj ponownie
          </button>
        </div>
      </body>
    </html>
  )
}

