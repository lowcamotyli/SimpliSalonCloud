-- Per-salon API keys for public booking widget
CREATE TABLE IF NOT EXISTS public.salon_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS salon_api_keys_active_hash_idx
  ON public.salon_api_keys(key_hash)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS salon_api_keys_salon_idx
  ON public.salon_api_keys(salon_id);

COMMENT ON TABLE public.salon_api_keys IS 'Per-salon API keys for public booking widget. Keyed by SHA-256 hash of raw key.';
