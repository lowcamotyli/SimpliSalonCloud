import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from './errors'
import { logger } from './logger'

export function handleApiError(error: unknown): NextResponse {
    // 1. Loguj błąd
    if (error instanceof AppError) {
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
    }

    // 3. Nieznany błąd
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
