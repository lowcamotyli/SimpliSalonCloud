-- Sprint 07: Blacklist CRM + behavioral no-show scoring

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS blacklist_status TEXT NOT NULL DEFAULT 'clean'
    CHECK (blacklist_status IN ('clean', 'warned', 'blacklisted')),
  ADD COLUMN IF NOT EXISTS no_show_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;

CREATE TABLE IF NOT EXISTS public.client_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('no_show', 'late_cancel')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_violations_client_occurred
  ON public.client_violations(client_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.blacklist_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE UNIQUE,
  no_show_threshold INT NOT NULL DEFAULT 2 CHECK (no_show_threshold > 0),
  late_cancel_threshold INT NOT NULL DEFAULT 3 CHECK (late_cancel_threshold > 0),
  window_months INT NOT NULL DEFAULT 6 CHECK (window_months BETWEEN 1 AND 24),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.blacklist_settings (salon_id)
SELECT id FROM public.salons
ON CONFLICT (salon_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_client_no_show(p_client_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.clients
  SET no_show_count = COALESCE(no_show_count, 0) + 1
  WHERE id = p_client_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_client_no_show(UUID) TO authenticated, service_role;

ALTER TABLE public.client_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_violations' AND policyname = 'salon_rw_client_violations'
  ) THEN
    CREATE POLICY "salon_rw_client_violations"
      ON public.client_violations
      FOR ALL
      USING (
        client_id IN (
          SELECT c.id
          FROM public.clients c
          WHERE c.salon_id = public.get_user_salon_id()
        )
      )
      WITH CHECK (
        client_id IN (
          SELECT c.id
          FROM public.clients c
          WHERE c.salon_id = public.get_user_salon_id()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'blacklist_settings' AND policyname = 'salon_rw_blacklist_settings'
  ) THEN
    CREATE POLICY "salon_rw_blacklist_settings"
      ON public.blacklist_settings
      FOR ALL
      USING (salon_id = public.get_user_salon_id())
      WITH CHECK (
        salon_id = public.get_user_salon_id()
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
      );
  END IF;
END $$;

GRANT ALL ON public.client_violations TO service_role;
GRANT ALL ON public.blacklist_settings TO service_role;
GRANT SELECT, INSERT ON public.client_violations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.blacklist_settings TO authenticated;
