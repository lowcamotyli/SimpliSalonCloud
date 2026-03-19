-- Migration: booksy_sync_logs - audit trail for Booksy sync sessions

CREATE TABLE IF NOT EXISTS booksy_sync_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
    triggered_by text NOT NULL CHECK (triggered_by IN ('cron', 'manual', 'webhook')),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    duration_ms integer,
    emails_found integer NOT NULL DEFAULT 0,
    emails_success integer NOT NULL DEFAULT 0,
    emails_error integer NOT NULL DEFAULT 0,
    sync_results jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booksy_sync_logs_salon_id ON booksy_sync_logs(salon_id);
CREATE INDEX IF NOT EXISTS idx_booksy_sync_logs_started ON booksy_sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_booksy_sync_logs_triggered ON booksy_sync_logs(triggered_by);

ALTER TABLE booksy_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their salon's sync logs" ON public.booksy_sync_logs;
CREATE POLICY "Users can view their salon's sync logs"
ON booksy_sync_logs
FOR SELECT
TO authenticated
USING (salon_id = public.get_user_salon_id());
