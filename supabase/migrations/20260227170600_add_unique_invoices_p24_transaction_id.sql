-- Ensure idempotency for Przelewy24 payment success retries.
-- One non-null p24_transaction_id must map to at most one invoice row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_p24_transaction_id_not_null
  ON public.invoices (p24_transaction_id)
  WHERE p24_transaction_id IS NOT NULL;

