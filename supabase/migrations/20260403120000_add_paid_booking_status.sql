-- Add 'paid' to bookings status constraint
-- Used when a booking is confirmed via online payment (P24)
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check,
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending',
      'confirmed',
      'paid',
      'completed',
      'cancelled',
      'no_show',
      'scheduled'
    ));
