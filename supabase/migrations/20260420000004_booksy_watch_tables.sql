CREATE TABLE IF NOT EXISTS public.booksy_gmail_watches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_gmail_account_id UUID NOT NULL UNIQUE REFERENCES public.booksy_gmail_accounts(id) ON DELETE CASCADE,
    watch_status TEXT NOT NULL DEFAULT 'pending' CHECK (watch_status IN ('active', 'expired', 'error', 'pending', 'stopped')),
    last_history_id BIGINT,
    watch_expiration TIMESTAMPTZ,
    last_notification_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    renewal_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booksy_gmail_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_gmail_account_id UUID NOT NULL REFERENCES public.booksy_gmail_accounts(id) ON DELETE CASCADE,
    pubsub_message_id TEXT NOT NULL UNIQUE,
    history_id BIGINT NOT NULL,
    email_address TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed', 'skipped')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booksy_reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booksy_gmail_account_id UUID REFERENCES public.booksy_gmail_accounts(id),
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    emails_checked INT DEFAULT 0,
    emails_missing INT DEFAULT 0,
    emails_backfilled INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS booksy_gmail_watches_salon_id_idx
    ON public.booksy_gmail_watches (salon_id);

CREATE INDEX IF NOT EXISTS booksy_gmail_watches_watch_status_idx
    ON public.booksy_gmail_watches (watch_status);

CREATE INDEX IF NOT EXISTS booksy_gmail_notifications_salon_id_idx
    ON public.booksy_gmail_notifications (salon_id);

CREATE INDEX IF NOT EXISTS booksy_gmail_notifications_booksy_gmail_account_id_idx
    ON public.booksy_gmail_notifications (booksy_gmail_account_id);

CREATE INDEX IF NOT EXISTS booksy_gmail_notifications_processing_status_idx
    ON public.booksy_gmail_notifications (processing_status);

CREATE INDEX IF NOT EXISTS booksy_gmail_notifications_received_at_idx
    ON public.booksy_gmail_notifications (received_at DESC);

CREATE INDEX IF NOT EXISTS booksy_reconciliation_runs_salon_id_idx
    ON public.booksy_reconciliation_runs (salon_id);

CREATE INDEX IF NOT EXISTS booksy_reconciliation_runs_booksy_gmail_account_id_idx
    ON public.booksy_reconciliation_runs (booksy_gmail_account_id);

CREATE INDEX IF NOT EXISTS booksy_reconciliation_runs_status_idx
    ON public.booksy_reconciliation_runs (status);

CREATE INDEX IF NOT EXISTS booksy_reconciliation_runs_started_at_idx
    ON public.booksy_reconciliation_runs (started_at DESC);

ALTER TABLE public.booksy_gmail_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booksy_gmail_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booksy_reconciliation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booksy_gmail_watches_select" ON public.booksy_gmail_watches;
CREATE POLICY "booksy_gmail_watches_select"
ON public.booksy_gmail_watches
FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_watches_insert" ON public.booksy_gmail_watches;
CREATE POLICY "booksy_gmail_watches_insert"
ON public.booksy_gmail_watches
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_watches_update" ON public.booksy_gmail_watches;
CREATE POLICY "booksy_gmail_watches_update"
ON public.booksy_gmail_watches
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_watches_delete" ON public.booksy_gmail_watches;
CREATE POLICY "booksy_gmail_watches_delete"
ON public.booksy_gmail_watches
FOR DELETE
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_notifications_select" ON public.booksy_gmail_notifications;
CREATE POLICY "booksy_gmail_notifications_select"
ON public.booksy_gmail_notifications
FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_notifications_insert" ON public.booksy_gmail_notifications;
CREATE POLICY "booksy_gmail_notifications_insert"
ON public.booksy_gmail_notifications
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_notifications_update" ON public.booksy_gmail_notifications;
CREATE POLICY "booksy_gmail_notifications_update"
ON public.booksy_gmail_notifications
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_gmail_notifications_delete" ON public.booksy_gmail_notifications;
CREATE POLICY "booksy_gmail_notifications_delete"
ON public.booksy_gmail_notifications
FOR DELETE
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_reconciliation_runs_select" ON public.booksy_reconciliation_runs;
CREATE POLICY "booksy_reconciliation_runs_select"
ON public.booksy_reconciliation_runs
FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_reconciliation_runs_insert" ON public.booksy_reconciliation_runs;
CREATE POLICY "booksy_reconciliation_runs_insert"
ON public.booksy_reconciliation_runs
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_reconciliation_runs_update" ON public.booksy_reconciliation_runs;
CREATE POLICY "booksy_reconciliation_runs_update"
ON public.booksy_reconciliation_runs
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "booksy_reconciliation_runs_delete" ON public.booksy_reconciliation_runs;
CREATE POLICY "booksy_reconciliation_runs_delete"
ON public.booksy_reconciliation_runs
FOR DELETE
USING (salon_id = public.get_user_salon_id());
