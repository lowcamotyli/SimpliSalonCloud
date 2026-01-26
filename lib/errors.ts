// Bazowa klasa dla wszystkich błędów aplikacji
export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public details?: unknown
    ) {
        super(message)
        this.name = this.constructor.name

        // Zachowaj stack trace
        Error.captureStackTrace(this, this.constructor)
    }

    // Metoda do konwersji na JSON (dla API response)
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details
        }
    }
}

// Błąd walidacji (400)
export class ValidationError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 'VALIDATION_ERROR', 400, details)
    }
}

// Zasób nie znaleziony (404)
export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        const message = id
            ? `${resource} with id ${id} not found`
            : `${resource} not found`
        super(message, 'NOT_FOUND', 404)
    }
}

// Brak autoryzacji (401)
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401)
    }
}

// Brak dostępu (403)
export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 'FORBIDDEN', 403)
    }
}

// Konflikt - np. duplikat (409)
export class ConflictError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, 'CONFLICT', 409, details)
    }
}
