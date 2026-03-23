CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_salon_client_created
  ON public.sms_messages(salon_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_provider
  ON public.sms_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  hours_before INT NOT NULL CHECK (hours_before > 0),
  message_template TEXT NOT NULL,
  require_confirmation BOOLEAN NOT NULL DEFAULT true,
  target_blacklisted_only BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_salon_active
  ON public.reminder_rules(salon_id, is_active);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS sms_provider TEXT NOT NULL DEFAULT 'smsapi'
    CHECK (sms_provider IN ('smsapi', 'bulkgate'));

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS bulkgate_app_id TEXT;

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS bulkgate_app_token TEXT;

CREATE OR REPLACE FUNCTION public.decrement_sms_balance(p_salon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows INT := 0;
BEGIN
  UPDATE public.sms_wallet
  SET balance = balance - 1,
      updated_at = now()
  WHERE salon_id = p_salon_id
    AND balance > 0;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_sms_balance(UUID) TO authenticated, service_role;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sms_messages' AND policyname = 'salon_rw_sms_messages'
  ) THEN
    DROP POLICY IF EXISTS "salon_rw_sms_messages" ON public.sms_messages;
CREATE POLICY "salon_rw_sms_messages"
      ON public.sms_messages
      FOR ALL
      USING (salon_id = public.get_user_salon_id())
      WITH CHECK (salon_id = public.get_user_salon_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reminder_rules' AND policyname = 'salon_rw_reminder_rules'
  ) THEN
    DROP POLICY IF EXISTS "salon_rw_reminder_rules" ON public.reminder_rules;
CREATE POLICY "salon_rw_reminder_rules"
      ON public.reminder_rules
      FOR ALL
      USING (salon_id = public.get_user_salon_id())
      WITH CHECK (salon_id = public.get_user_salon_id());
  END IF;
END $$;

GRANT ALL ON public.sms_messages TO service_role;
GRANT ALL ON public.reminder_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sms_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_rules TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'sms_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
  END IF;
END $$;
