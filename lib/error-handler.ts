import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { ZodError } from 'zod'
import { AppError } from './errors'
import { logger } from './logger'

function captureExceptionIfConfigured(error: unknown, context: Record<string, unknown>) {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
        return
    }

    Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(context)) {
            scope.setExtra(key, value)
        }
        Sentry.captureException(error)
    })
}

export function handleApiError(error: unknown): NextResponse {
    // 1. Loguj błąd
    if (error instanceof AppError) {
        captureExceptionIfConfigured(error, {
            kind: 'AppError',
            code: error.code,
            statusCode: error.statusCode,
        })

        logger.error('Application error', error, {
            code: error.code,
            statusCode: error.statusCode,
            details: error.details
        })

        return NextResponse.json(
            error.toJSON(),
            { status: error.statusCode }
        )
    }

    // Błędy walidacji z Zod
    if (error instanceof ZodError) {
        captureExceptionIfConfigured(error, {
            kind: 'ZodError',
            errorCount: error.errors.length,
        })

        logger.warn('Validation error', {
            details: error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }))
        })

        return NextResponse.json(
            {
                name: 'ValidationError',
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message
                }))
            },
            { status: 400 }
        )
    }

    // Błędy z PostgreSQL/Supabase
    if (error && typeof error === 'object' && 'code' in error) {
        const pgError = error as { code: string; message: string; details?: string }
        captureExceptionIfConfigured(error, {
            kind: 'DatabaseError',
            code: pgError.code,
        })

        // Foreign key violation (23503)
        if (pgError.code === '23503') {
            logger.error('Database reference error', error, {
                code: pgError.code,
                details: pgError.details
            })
            return NextResponse.json(
                {
                    name: 'ReferenceError',
                    message: 'Referenced record does not exist',
                    code: 'FOREIGN_KEY_VIOLATION',
                    details: pgError.details
                },
                { status: 400 }
            )
        }

        // Unique constraint violation (23505) - duplikat
        if (pgError.code === '23505') {
            logger.error('Database conflict error', error, {
                code: pgError.code,
                details: pgError.details
            })
            return NextResponse.json(
                {
                    name: 'ConflictError',
                    message: 'Record already exists',
                    code: 'UNIQUE_VIOLATION',
                    details: pgError.details
                },
                { status: 409 }
            )
        }

        // Check constraint violation (23514)
        if (pgError.code === '23514') {
            logger.error('Database constraint error', error, {
                code: pgError.code,
                details: pgError.details
            })
            return NextResponse.json(
                {
                    name: 'ValidationError',
                    message: 'Data violates database constraints',
                    code: 'CHECK_VIOLATION',
                    details: pgError.details
                },
                { status: 400 }
            )
        }

        // Version conflict - optimistic locking failure (P0001)
        if (pgError.code === 'P0001' && pgError.message.includes('modified by another user')) {
            // Parse expected and actual version from error message
            // Message format: "Record has been modified by another user (expected version X, got Y)"
            const versionMatch = pgError.message.match(/expected version (\d+), got (\d+)/)
            const expectedVersion = versionMatch ? parseInt(versionMatch[1]) : undefined
            const providedVersion = versionMatch ? parseInt(versionMatch[2]) : undefined

            logger.warn('Version conflict detected', {
                code: pgError.code,
                expectedVersion,
                providedVersion
            })

            return NextResponse.json(
                {
                    name: 'ConflictError',
                    message: 'This record has been modified by another user. Please refresh and try again.',
                    code: 'STALE_VERSION',
                    details: {
                        expectedVersion,
                        providedVersion,
                        hint: 'Reload the record to get the latest version before updating'
                    }
                },
                { status: 409 }
            )
        }
    }

    // 3. Nieznany błąd
    captureExceptionIfConfigured(error, {
        kind: 'UnhandledError',
    })

    logger.error('Unhandled error', error, {
        errorType: error?.constructor?.name,
        errorString: String(error)
    })

    const isDevelopment = process.env.NODE_ENV === 'development'

    return NextResponse.json(
        {
            name: 'InternalServerError',
            message: isDevelopment
                ? String(error)
                : 'An unexpected error occurred',
            code: 'INTERNAL_ERROR'
        },
        { status: 500 }
    )
}

// Helper function - owijka dla API routes
export function withErrorHandling(
    handler: (req: any, context?: any) => Promise<NextResponse>
) {
    return async (req: any, context?: any) => {
        try {
            return await handler(req, context)
        } catch (error) {
            return handleApiError(error)
        }
    }
}
