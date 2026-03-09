-- Add service_id to satisfaction_surveys
-- Required because cron/surveys/route.ts saves service_id from booking
ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_service ON public.satisfaction_surveys(service_id);
