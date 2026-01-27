// Typy logów
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Kontekst dla logów (dodatkowe informacje)
interface LogContext {
    salonId?: string
    userId?: string
    requestId?: string
    action?: string
    duration?: number
    [key: string]: any // Możesz dodać dowolne pola
}

class Logger {
    // Czy logować w zależności od poziomu i środowiska
    private shouldLog(level: LogLevel): boolean {
        // W production loguj tylko warn i error
        if (process.env.NODE_ENV === 'production') {
            return ['warn', 'error'].includes(level)
        }
        // W development loguj wszystko
        return true
    }

    // Formatuj log jako JSON
    private format(level: LogLevel, message: string, context?: LogContext) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            environment: process.env.NODE_ENV,
            ...context
        })
    }

    // Metody logowania

    debug(message: string, context?: LogContext) {
        if (this.shouldLog('debug')) {
            console.log(this.format('debug', message, context))
        }
    }

    info(message: string, context?: LogContext) {
        if (this.shouldLog('info')) {
            console.log(this.format('info', message, context))
        }
    }

    warn(message: string, context?: LogContext) {
        if (this.shouldLog('warn')) {
            console.warn(this.format('warn', message, context))
        }
    }

    error(message: string, error?: unknown, context?: LogContext) {
        if (this.shouldLog('error')) {
            let errorInfo: any = {}

            if (error instanceof Error) {
                errorInfo = {
                    error: error.message,
                    stack: error.stack,
                    name: error.name
                }
            } else if (error && typeof error === 'object') {
                // Handle Supabase/PostgrestError and other objects
                errorInfo = {
                    error: (error as any).message || String(error),
                    code: (error as any).code,
                    details: (error as any).details,
                    hint: (error as any).hint,
                    // Include all enumerable properties for debugging
                    ...Object.fromEntries(
                        Object.entries(error).filter(([key]) =>
                            !['stack'].includes(key) // Exclude stack trace from object errors
                        )
                    )
                }
            } else if (error) {
                errorInfo = {
                    error: String(error)
                }
            }

            console.error(this.format('error', message, {
                ...context,
                ...errorInfo
            }))
        }
    }
}

// Eksportuj singleton
export const logger = new Logger()
