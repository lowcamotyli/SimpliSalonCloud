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
    [key: string]: unknown
}

// Pola PII które należy redaktować przed logowaniem
const PII_FIELDS = new Set([
    'email',
    'phone',
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'name',
    'full_name',
    'firstName',
    'lastName',
    'first_name',
    'last_name',
    'owner_email',
    'billing_email',
])

const REDACTED = '[REDACTED]'

function scrubPii(value: unknown, depth = 0): unknown {
    if (depth > 5) return value // guard against circular / deeply nested objects
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value

    if (Array.isArray(value)) {
        return value.map((item) => scrubPii(item, depth + 1))
    }

    const scrubbed: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (PII_FIELDS.has(key)) {
            scrubbed[key] = REDACTED
        } else {
            scrubbed[key] = scrubPii(val, depth + 1)
        }
    }
    return scrubbed
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
    private format(level: LogLevel, message: string, context?: unknown) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            environment: process.env.NODE_ENV,
            ...(context && typeof context === 'object' ? context : {}),
        })
    }

    // Metody logowania

    debug(message: string, context?: LogContext) {
        if (this.shouldLog('debug')) {
            console.log(this.format('debug', message, scrubPii(context)))
        }
    }

    info(message: string, context?: LogContext) {
        if (this.shouldLog('info')) {
            console.log(this.format('info', message, scrubPii(context)))
        }
    }

    warn(message: string, context?: LogContext) {
        if (this.shouldLog('warn')) {
            console.warn(this.format('warn', message, scrubPii(context)))
        }
    }

    error(message: string, error?: unknown, context?: LogContext) {
        if (this.shouldLog('error')) {
            let errorInfo: Record<string, unknown> = {}

            if (error instanceof Error) {
                errorInfo = {
                    error: error.message,
                    stack: error.stack,
                    name: error.name,
                }
            } else if (error && typeof error === 'object') {
                // Handle Supabase/PostgrestError and other objects
                // Scrub full object to remove PII before spreading
                const scrubbed = scrubPii(error) as Record<string, unknown>
                errorInfo = {
                    error: (error as Record<string, unknown>).message || String(error),
                    code: (error as Record<string, unknown>).code,
                    details: (error as Record<string, unknown>).details,
                    hint: (error as Record<string, unknown>).hint,
                    ...Object.fromEntries(
                        Object.entries(scrubbed).filter(([key]) => !['stack'].includes(key))
                    ),
                }
            } else if (error) {
                errorInfo = {
                    error: String(error),
                }
            }

            console.error(
                this.format('error', message, {
                    ...((scrubPii(context) as Record<string, unknown>) ?? {}),
                    ...errorInfo,
                })
            )
        }
    }
}

// Eksportuj singleton
export const logger = new Logger()
