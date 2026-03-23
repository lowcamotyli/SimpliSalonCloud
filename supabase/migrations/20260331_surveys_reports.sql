ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS survey_sent BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  nps_score INT CHECK (nps_score BETWEEN 0 AND 10),
  comment TEXT,
  fill_token TEXT UNIQUE,
  fill_token_exp TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_salon_date ON public.satisfaction_surveys(salon_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveys_client ON public.satisfaction_surveys(client_id);
CREATE INDEX IF NOT EXISTS idx_surveys_fill_token ON public.satisfaction_surveys(fill_token) WHERE fill_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_survey_sent ON public.bookings(salon_id, survey_sent) WHERE survey_sent = false;

ALTER TABLE public.satisfaction_surveys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'satisfaction_surveys' AND policyname = 'salon_read_surveys'
  ) THEN
    DROP POLICY IF EXISTS salon_read_surveys ON public.satisfaction_surveys;
CREATE POLICY salon_read_surveys ON public.satisfaction_surveys FOR SELECT USING (
      salon_id = public.get_user_salon_id()
    );
  END IF;
END $$;
