-- CRM Batch 1: usage counters, provider settings, and CRM feature flags

ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS emails_sent_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_sent_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_limit_exceeded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_limit_exceeded BOOLEAN DEFAULT false;

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS resend_api_key TEXT,
  ADD COLUMN IF NOT EXISTS resend_from_email TEXT,
  ADD COLUMN IF NOT EXISTS resend_from_name TEXT,
  ADD COLUMN IF NOT EXISTS smsapi_token TEXT,
  ADD COLUMN IF NOT EXISTS smsapi_sender_name TEXT;

-- CRM feature flags:
-- - crm_campaigns: enabled for professional+
-- - crm_automations: enabled for professional+ with plan-specific limits
-- - crm_sms: alias behavior for sms_notifications on professional+

INSERT INTO public.feature_flags (salon_id, feature_name, enabled, limit_value)
SELECT
  s.id,
  'crm_campaigns',
  (s.subscription_plan IN ('professional', 'business', 'enterprise')),
  NULL
FROM public.salons s
ON CONFLICT (salon_id, feature_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = NOW();

INSERT INTO public.feature_flags (salon_id, feature_name, enabled, limit_value)
SELECT
  s.id,
  'crm_automations',
  (s.subscription_plan IN ('professional', 'business', 'enterprise')),
  CASE
    WHEN s.subscription_plan = 'professional' THEN 2
    WHEN s.subscription_plan = 'business' THEN 10
    WHEN s.subscription_plan = 'enterprise' THEN NULL
    ELSE 0
  END
FROM public.salons s
ON CONFLICT (salon_id, feature_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = NOW();

INSERT INTO public.feature_flags (salon_id, feature_name, enabled, limit_value)
SELECT
  s.id,
  'crm_sms',
  (s.subscription_plan IN ('professional', 'business', 'enterprise')),
  NULL
FROM public.salons s
ON CONFLICT (salon_id, feature_name) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = NOW();

