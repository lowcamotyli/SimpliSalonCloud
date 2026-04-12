ALTER TABLE public.salon_settings ADD COLUMN IF NOT EXISTS terms_text TEXT;
ALTER TABLE public.salon_settings ADD COLUMN IF NOT EXISTS terms_url TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
