-- Migration: Add extended Booksy integration settings to salon_settings
-- Date: 2026-02-18
ALTER TABLE salon_settings
ADD COLUMN IF NOT EXISTS booksy_sync_interval_minutes INTEGER DEFAULT 15,
    ADD COLUMN IF NOT EXISTS booksy_sender_filter TEXT DEFAULT 'noreply@booksy.com',
    ADD COLUMN IF NOT EXISTS booksy_auto_create_clients BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS booksy_auto_create_services BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS booksy_notify_on_new BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS booksy_notify_on_cancel BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS booksy_notify_email TEXT,
    ADD COLUMN IF NOT EXISTS booksy_last_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS booksy_sync_stats JSONB DEFAULT '{"total": 0, "success": 0, "errors": 0}'::jsonb;
COMMENT ON COLUMN salon_settings.booksy_sync_interval_minutes IS 'How often (in minutes) to check for new Booksy emails via cron';
COMMENT ON COLUMN salon_settings.booksy_sender_filter IS 'Email address filter for Booksy notification emails (e.g. noreply@booksy.com)';
COMMENT ON COLUMN salon_settings.booksy_auto_create_clients IS 'Automatically create new clients from Booksy bookings if not found';
COMMENT ON COLUMN salon_settings.booksy_auto_create_services IS 'Automatically create new services from Booksy bookings if not found';
COMMENT ON COLUMN salon_settings.booksy_notify_on_new IS 'Send notification email when a new Booksy booking is processed';
COMMENT ON COLUMN salon_settings.booksy_notify_on_cancel IS 'Send notification email when a Booksy cancellation is processed';
COMMENT ON COLUMN salon_settings.booksy_notify_email IS 'Email address to send Booksy event notifications to';
COMMENT ON COLUMN salon_settings.booksy_last_sync_at IS 'Timestamp of the last successful Booksy sync';
COMMENT ON COLUMN salon_settings.booksy_sync_stats IS 'Cumulative stats: total, success, errors processed emails';