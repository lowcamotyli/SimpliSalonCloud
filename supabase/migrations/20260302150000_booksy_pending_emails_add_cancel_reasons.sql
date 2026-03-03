-- ============================================================
-- Extend booksy_pending_emails.failure_reason CHECK constraint
-- to include cancel_not_found and reschedule_not_found
-- ============================================================
ALTER TABLE booksy_pending_emails DROP CONSTRAINT IF EXISTS booksy_pending_emails_failure_reason_check;
ALTER TABLE booksy_pending_emails
ADD CONSTRAINT booksy_pending_emails_failure_reason_check CHECK (
        failure_reason IN (
            'parse_failed',
            'service_not_found',
            'employee_not_found',
            'cancel_not_found',
            'reschedule_not_found',
            'other'
        )
    );