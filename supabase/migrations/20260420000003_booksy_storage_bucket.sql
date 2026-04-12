-- Create private Storage bucket for raw Booksy emails
-- Path pattern: {salon_id}/{account_id}/{year}/{month}/{gmail_message_id}.eml
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('booksy-raw-emails', 'booksy-raw-emails', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
