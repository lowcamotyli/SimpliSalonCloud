-- Add 'voucher' as allowed payment method for bookings
ALTER TABLE bookings
  DROP CONSTRAINT bookings_payment_method_check,
  ADD CONSTRAINT bookings_payment_method_check
    CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'other'::text, 'voucher'::text])) OR (payment_method IS NULL));
