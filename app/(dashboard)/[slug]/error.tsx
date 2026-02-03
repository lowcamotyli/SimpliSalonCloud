'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCcw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Dashboard Error:', error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center animate-fade-in">
            <div className="p-4 rounded-full bg-rose-50 mb-6">
                <AlertCircle className="h-12 w-12 text-rose-500" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Coś poszło nie tak
            </h2>

            <p className="text-gray-500 max-w-md mb-8">
                Wystąpił nieoczekiwany błąd podczas ładowania panelu. Może to być problem z uprawnieniami (RLS) lub połączeniem z bazą danych.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
                <Button
                    onClick={() => reset()}
                    size="lg"
                    className="gradient-button rounded-xl h-12 px-6 font-bold flex gap-2"
                >
                    <RefreshCcw className="h-5 w-5" />
                    Spróbuj ponownie
                </Button>

                <Link href="/">
                    <Button variant="outline" size="lg" className="rounded-xl h-12 px-6 font-bold border-2 flex gap-2">
                        <Home className="h-5 w-5" />
                        Wróć do strony głównej
                    </Button>
                </Link>
            </div>

            {process.env.NODE_ENV === 'development' && (
                <div className="mt-12 p-4 bg-gray-50 rounded-xl border border-gray-100 text-left max-w-2xl overflow-auto">
                    <p className="text-xs font-mono text-rose-600 mb-2 font-bold uppercase tracking-wider">Debug Info:</p>
                    <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                        {error.message}
                    </pre>
                    {error.digest && (
                        <p className="text-[10px] text-gray-400 mt-2 font-mono">Digest: {error.digest}</p>
                    )}
                </div>
            )}
        </div>
    )
}
