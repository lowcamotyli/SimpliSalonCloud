ALTER TABLE public.salon_settings
ADD COLUMN IF NOT EXISTS booksy_sync_from_date DATE;

COMMENT ON COLUMN public.salon_settings.booksy_sync_from_date IS
  'Oldest Booksy email date included in manual, cron, and reconciliation sync.';
