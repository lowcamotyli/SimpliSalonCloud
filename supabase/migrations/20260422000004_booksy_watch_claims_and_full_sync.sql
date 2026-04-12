ALTER TABLE public.booksy_gmail_watches
ADD COLUMN IF NOT EXISTS needs_full_sync BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS processing_claim_token TEXT,
ADD COLUMN IF NOT EXISTS processing_claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS booksy_gmail_watches_processing_claimed_at_idx
    ON public.booksy_gmail_watches (processing_claimed_at);
