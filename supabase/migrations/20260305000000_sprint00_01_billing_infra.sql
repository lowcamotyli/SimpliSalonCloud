CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.salons.features IS 'Feature flags: billing, equipment, medical_forms, sms_chat, blacklist, surveys';

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS p24_token TEXT;
COMMENT ON COLUMN public.subscriptions.p24_token IS 'Tokenised card for recurring P24 charges';

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS dunning_attempt INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.subscriptions.dunning_attempt IS 'Failed payment retries, max 3';

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
COMMENT ON COLUMN public.subscriptions.next_retry_at IS 'Timestamp for next dunning attempt';

CREATE INDEX IF NOT EXISTS idx_subscriptions_dunning ON public.subscriptions(status, next_retry_at) WHERE status = 'past_due';

CREATE TABLE IF NOT EXISTS public.sms_wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (salon_id)
);

ALTER TABLE public.sms_wallet ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sms_wallet' AND policyname = 'salon_members_read_sms_wallet'
    ) THEN
        DROP POLICY IF EXISTS "salon_members_read_sms_wallet" ON public.sms_wallet;
CREATE POLICY "salon_members_read_sms_wallet" ON public.sms_wallet 
        FOR SELECT USING (salon_id = public.get_user_salon_id());
    END IF;
END $$;

GRANT ALL ON public.sms_wallet TO service_role;
GRANT SELECT ON public.sms_wallet TO authenticated;
