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
            const errorObj = error instanceof Error ? error : new Error(String(error))
            console.error(this.format('error', message, {
                ...context,
                error: errorObj.message,
                stack: errorObj.stack
            }))
        }
    }
}

// Eksportuj singleton
export const logger = new Logger()
