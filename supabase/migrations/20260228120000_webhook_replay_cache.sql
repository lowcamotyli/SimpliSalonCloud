CREATE TABLE IF NOT EXISTS public.webhook_replay_cache (
    event_id TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.webhook_replay_cache DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_webhook_replay_cache_expires_at ON public.webhook_replay_cache (expires_at);

COMMENT ON TABLE public.webhook_replay_cache IS 'used for SMSAPI webhook replay protection';
