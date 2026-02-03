'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Global Application Error:', error)
    }, [error])

    return (
        <html>
            <body className="flex items-center justify-center min-h-screen bg-gray-50 font-sans">
                <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-gray-100 text-center">
                    <div className="mx-auto w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6">
                        <AlertTriangle className="h-8 w-8 text-rose-600" />
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Błąd krytyczny</h1>
                    <p className="text-gray-500 mb-8">
                        Aplikacja napotkała nieoczekiwany błąd. Zespół techniczny został powiadomiony.
                    </p>

                    <Button
                        onClick={() => reset()}
                        size="lg"
                        className="w-full h-12 gradient-button rounded-xl font-bold flex gap-2"
                    >
                        <RefreshCw className="h-5 w-5" />
                        Odśwież aplikację
                    </Button>

                    {process.env.NODE_ENV === 'development' && (
                        <div className="mt-8 p-4 bg-gray-100 rounded-xl text-left overflow-auto max-h-40">
                            <pre className="text-[10px] text-gray-600 font-mono">
                                {error.stack}
                            </pre>
                        </div>
                    )}
                </div>
            </body>
        </html>
    )
}
