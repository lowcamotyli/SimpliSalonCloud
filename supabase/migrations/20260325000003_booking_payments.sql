-- Create the table for booking payments
CREATE TABLE public.booking_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PLN',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
    p24_session_id TEXT UNIQUE,
    p24_order_id TEXT,
    p24_transaction_id TEXT,
    payment_url TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_booking_payments_salon_booking ON public.booking_payments(salon_id, booking_id);

-- Enable Row Level Security
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- Separate RLS policies per operation (per coding standards)
CREATE POLICY "Select: own salon only"
ON public.booking_payments FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Insert: own salon only"
ON public.booking_payments FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Update: own salon only"
ON public.booking_payments FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_booking_payments_timestamp
BEFORE UPDATE ON public.booking_payments
FOR EACH ROW
EXECUTE PROCEDURE public.trigger_set_timestamp();
