CREATE TABLE public.client_balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'debit', 'refund')),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW public.client_balance_summary AS
SELECT
  client_id,
  salon_id,
  SUM(amount) AS balance
FROM public.client_balance_transactions
GROUP BY client_id, salon_id;

ALTER TABLE public.client_balance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow SELECT on client_balance_transactions for salon members"
ON public.client_balance_transactions
FOR SELECT
TO authenticated
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow INSERT on client_balance_transactions for salon members"
ON public.client_balance_transactions
FOR INSERT
TO authenticated
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow DELETE on client_balance_transactions for salon members"
ON public.client_balance_transactions
FOR DELETE
TO authenticated
USING (salon_id = public.get_user_salon_id());

CREATE INDEX client_balance_transactions_salon_client_idx
ON public.client_balance_transactions (salon_id, client_id);

CREATE INDEX client_balance_transactions_salon_created_at_idx
ON public.client_balance_transactions (salon_id, created_at DESC);
