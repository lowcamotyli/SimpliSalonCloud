-- Add survey configuration to services table
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS survey_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS survey_custom_message TEXT;

-- Add service reference to satisfaction_surveys for per-service reporting
ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_service ON public.satisfaction_surveys(service_id) WHERE service_id IS NOT NULL;
