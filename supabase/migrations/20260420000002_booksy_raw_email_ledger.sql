CREATE TABLE public.booksy_raw_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_gmail_account_id UUID NOT NULL REFERENCES public.booksy_gmail_accounts(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL,
    gmail_thread_id TEXT,
    gmail_history_id BIGINT,
    internal_date TIMESTAMPTZ,
    subject TEXT,
    from_address TEXT,
    message_id_header TEXT,
    storage_path TEXT,
    raw_sha256 TEXT,
    ingest_source TEXT NOT NULL CHECK (ingest_source IN ('watch', 'polling_fallback', 'reconciliation', 'manual_backfill')),
    parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (booksy_gmail_account_id, gmail_message_id)
);

CREATE TABLE public.booksy_parsed_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_raw_email_id UUID NOT NULL REFERENCES public.booksy_raw_emails(id),
    parser_version TEXT NOT NULL DEFAULT 'v1',
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'cancelled', 'rescheduled', 'unknown')),
    confidence_score NUMERIC(4,3) NOT NULL,
    trust_score NUMERIC(4,3),
    event_fingerprint TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'manual_review', 'discarded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (salon_id, event_fingerprint)
);

CREATE TABLE public.booksy_apply_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_parsed_event_id UUID REFERENCES public.booksy_parsed_events(id),
    idempotency_key TEXT NOT NULL UNIQUE,
    target_table TEXT,
    target_id UUID,
    operation TEXT NOT NULL CHECK (operation IN ('created', 'updated', 'skipped', 'failed')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_message TEXT
);

CREATE INDEX booksy_raw_emails_salon_id_parse_status_idx
    ON public.booksy_raw_emails (salon_id, parse_status);

CREATE INDEX booksy_raw_emails_booksy_gmail_account_id_idx
    ON public.booksy_raw_emails (booksy_gmail_account_id);

CREATE INDEX booksy_parsed_events_salon_id_status_idx
    ON public.booksy_parsed_events (salon_id, status);

CREATE INDEX booksy_parsed_events_booksy_raw_email_id_idx
    ON public.booksy_parsed_events (booksy_raw_email_id);

CREATE INDEX booksy_apply_ledger_salon_id_idx
    ON public.booksy_apply_ledger (salon_id);

CREATE INDEX booksy_apply_ledger_booksy_parsed_event_id_idx
    ON public.booksy_apply_ledger (booksy_parsed_event_id);

ALTER TABLE public.booksy_raw_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booksy_parsed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booksy_apply_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booksy_raw_emails_select"
ON public.booksy_raw_emails
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_raw_emails_insert"
ON public.booksy_raw_emails
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_raw_emails_update"
ON public.booksy_raw_emails
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_raw_emails_delete"
ON public.booksy_raw_emails
FOR DELETE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_parsed_events_select"
ON public.booksy_parsed_events
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_parsed_events_insert"
ON public.booksy_parsed_events
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_parsed_events_update"
ON public.booksy_parsed_events
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_parsed_events_delete"
ON public.booksy_parsed_events
FOR DELETE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_apply_ledger_select"
ON public.booksy_apply_ledger
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_apply_ledger_insert"
ON public.booksy_apply_ledger
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_apply_ledger_update"
ON public.booksy_apply_ledger
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_apply_ledger_delete"
ON public.booksy_apply_ledger
FOR DELETE
USING (salon_id = public.get_user_salon_id());

-- Bucket 'booksy-raw-emails' musi byc stworzony recznie w Supabase Dashboard
-- private, brak public access, brak limitu file size, brak ograniczen MIME dla raw .eml
-- Path pattern w kodzie: {salon_id}/{account_id}/{year}/{month}/{gmail_message_id}.eml
