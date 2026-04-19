export type BooksyErrorCode =
  | 'booking_not_found'
  | 'ambiguous_match'
  | 'service_not_found'
  | 'employee_not_found'
  | 'validation'
  | 'already_applied'

export class BookingNotFoundError extends Error {
  readonly code = 'booking_not_found'

  constructor(message = 'Booking not found') {
    super(message)
    this.name = 'BookingNotFoundError'
  }
}

export class AmbiguousMatchError extends Error {
  readonly code = 'ambiguous_match'
  readonly candidates?: unknown[]

  constructor(message = 'Ambiguous booking match', candidates?: unknown[]) {
    super(message)
    this.name = 'AmbiguousMatchError'
    this.candidates = candidates
  }
}

export class ServiceNotFoundError extends Error {
  readonly code = 'service_not_found'

  constructor(message = 'Service not found') {
    super(message)
    this.name = 'ServiceNotFoundError'
  }
}

export class EmployeeNotFoundError extends Error {
  readonly code = 'employee_not_found'

  constructor(message = 'Employee not found') {
    super(message)
    this.name = 'EmployeeNotFoundError'
  }
}

export class ValidationError extends Error {
  readonly code = 'validation'

  constructor(message = 'Validation error') {
    super(message)
    this.name = 'ValidationError'
  }
}

export class BookingAlreadyAppliedError extends Error {
  readonly code = 'already_applied'

  constructor(message = 'Booking update already applied') {
    super(message)
    this.name = 'BookingAlreadyAppliedError'
  }
}