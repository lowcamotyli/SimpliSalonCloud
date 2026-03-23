-- Vouchers Table
CREATE TABLE public.vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
    initial_value NUMERIC(10,2) NOT NULL CHECK (initial_value > 0),
    current_balance NUMERIC(10,2) NOT NULL CHECK (current_balance >= 0),
    buyer_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    beneficiary_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(salon_id, code)
);

-- Voucher Transactions Table
CREATE TABLE public.voucher_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(10,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments to tables and columns
COMMENT ON TABLE public.vouchers IS 'Stores gift cards or vouchers for a salon.';
COMMENT ON COLUMN public.vouchers.initial_value IS 'The original value of the voucher when it was created.';
COMMENT ON COLUMN public.vouchers.current_balance IS 'The remaining balance on the voucher.';
COMMENT ON COLUMN public.vouchers.buyer_client_id IS 'The client who purchased the voucher.';
COMMENT ON COLUMN public.vouchers.beneficiary_client_id IS 'The client who is intended to use the voucher.';
COMMENT ON COLUMN public.vouchers.status IS 'Current status of the voucher: active, used, or expired.';

COMMENT ON TABLE public.voucher_transactions IS 'Records all transactions (debits/credits) for a voucher.';
COMMENT ON COLUMN public.voucher_transactions.amount IS 'The amount of the transaction. Negative for deductions, positive for top-ups/refunds.';
COMMENT ON COLUMN public.voucher_transactions.balance_after IS 'The voucher balance immediately after this transaction.';

-- Indexes
CREATE INDEX idx_vouchers_salon_id_status ON public.vouchers(salon_id, status);
CREATE INDEX idx_vouchers_code ON public.vouchers(code);
CREATE INDEX idx_vouchers_expires_at_status ON public.vouchers(expires_at, status);
CREATE INDEX idx_voucher_transactions_voucher_id ON public.voucher_transactions(voucher_id);

-- updated_at Trigger for vouchers
CREATE TRIGGER handle_vouchers_updated_at
BEFORE UPDATE ON public.vouchers
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- RLS for vouchers
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow salon users to view their vouchers"
ON public.vouchers
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow salon users to create vouchers"
ON public.vouchers
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow salon users to update their vouchers"
ON public.vouchers
FOR UPDATE
USING (salon_id = public.get_user_salon_id());

-- RLS for voucher_transactions
ALTER TABLE public.voucher_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to see transactions for vouchers in their salon"
ON public.voucher_transactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.vouchers v
    WHERE v.id = voucher_transactions.voucher_id
      AND v.salon_id = public.get_user_salon_id()
  )
);

CREATE POLICY "Allow authenticated users to create transactions"
ON public.voucher_transactions
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Disallow updates and deletes on voucher_transactions
CREATE POLICY "Disallow updating voucher transactions"
ON public.voucher_transactions
FOR UPDATE
USING (false);

CREATE POLICY "Disallow deleting voucher transactions"
ON public.voucher_transactions
FOR DELETE
USING (false);
