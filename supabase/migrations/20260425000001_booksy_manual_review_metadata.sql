ALTER TABLE public.booksy_parsed_events
ADD COLUMN IF NOT EXISTS review_reason TEXT,
ADD COLUMN IF NOT EXISTS review_detail TEXT,
ADD COLUMN IF NOT EXISTS apply_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_apply_error TEXT,
ADD COLUMN IF NOT EXISTS last_apply_attempt_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS candidate_bookings JSONB;

CREATE INDEX IF NOT EXISTS booksy_parsed_events_manual_review_reason_idx
ON public.booksy_parsed_events (salon_id, review_reason)
WHERE status = 'manual_review';
