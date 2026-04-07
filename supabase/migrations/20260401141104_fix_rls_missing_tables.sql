-- Fix: Enable RLS on tables missing Row Level Security
-- Addresses Supabase security alert: rls_disabled_in_public

-- 1. crm_completed_booking_applications
--    Internal lookup table (prevents duplicate CRM campaign applications per booking).
--    Only written/read by service_role via CRON. No direct client access needed.
ALTER TABLE public.crm_completed_booking_applications ENABLE ROW LEVEL SECURITY;

-- Deny all direct access — only service_role bypasses RLS
CREATE POLICY "No direct access — service_role only"
  ON public.crm_completed_booking_applications
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2. webhook_replay_cache
--    Stores SMSAPI webhook event IDs for replay protection.
--    Only written/read by service_role via webhook handler. No client access needed.
ALTER TABLE public.webhook_replay_cache ENABLE ROW LEVEL SECURITY;

-- Deny all direct access — only service_role bypasses RLS
CREATE POLICY "No direct access — service_role only"
  ON public.webhook_replay_cache
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
