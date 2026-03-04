// Typy logów
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

// Kontekst dla logów (dodatkowe informacje)
interface LogContext {
    salonId?: string
    userId?: string
    requestId?: string
    action?: string
    duration?: number
    messageId?: string
    [key: string]: any // Możesz dodać dowolne pola
}

class Logger {
    // Minimalny poziom logowania — kontrolowany przez LOG_LEVEL env var
    // Domyślnie 'info' (widoczne na Vercelu), można ustawić 'debug' lokalnie
    private minLevel: number

    constructor() {
        const envLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel
        this.minLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info
    }

    // Czy logować w zależności od poziomu
    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= this.minLevel
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
