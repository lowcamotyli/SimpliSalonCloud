export type BooksyFailureCode =
  | 'schema_drift'
  | 'timeout'
  | 'gmail_cursor_expired'
  | 'cancel_not_found'
  | 'reschedule_not_found'
  | 'ambiguous_match'
  | 'missing_old_date'
  | 'validation'
  | 'unknown'

export type BooksyFailureClassification = {
  code: BooksyFailureCode
  retryable: boolean
}

const SCHEMA_DRIFT_PATTERNS = [
  /processing_claim_token does not exist/i,
  /processing_claimed_at does not exist/i,
  /needs_full_sync does not exist/i,
  /schema cache/i,
]

const TIMEOUT_PATTERNS = [
  /timeout/i,
  /temporarily unavailable/i,
  /econnreset/i,
  /network/i,
]

const PERMANENT_PATTERNS: Array<{ code: BooksyFailureCode; pattern: RegExp }> = [
  { code: 'cancel_not_found', pattern: /booking to cancel not found|cancel_not_found/i },
  { code: 'reschedule_not_found', pattern: /booking to reschedule not found|brak aktywnej rezerwacji|reschedule_not_found/i },
  { code: 'ambiguous_match', pattern: /wymagana reczna weryfikacja|ambiguous/i },
  { code: 'missing_old_date', pattern: /missing old date|brak podanej nowej daty/i },
  { code: 'validation', pattern: /client phone is required|employee not found|invalid client name/i },
]

export function classifyBooksyFailure(message: string | null | undefined): BooksyFailureClassification {
  const normalized = message ?? ''

  if (/gmail history cursor expired/i.test(normalized)) {
    return { code: 'gmail_cursor_expired', retryable: false }
  }

  if (SCHEMA_DRIFT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { code: 'schema_drift', retryable: true }
  }

  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { code: 'timeout', retryable: true }
  }

  const permanent = PERMANENT_PATTERNS.find(({ pattern }) => pattern.test(normalized))
  if (permanent) {
    return { code: permanent.code, retryable: false }
  }

  return { code: 'unknown', retryable: false }
}

export function isRetryableBooksyFailure(message: string | null | undefined): boolean {
  return classifyBooksyFailure(message).retryable
}
