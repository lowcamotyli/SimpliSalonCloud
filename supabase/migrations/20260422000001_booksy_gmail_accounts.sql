CREATE TABLE public.booksy_gmail_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    gmail_email TEXT NOT NULL,
    display_name TEXT,
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    auth_status TEXT NOT NULL DEFAULT 'active' CHECK (auth_status IN ('active', 'revoked', 'expired', 'error')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    last_auth_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (salon_id, gmail_email)
);

CREATE UNIQUE INDEX booksy_gmail_accounts_one_primary_per_salon_idx
    ON public.booksy_gmail_accounts (salon_id)
    WHERE is_primary = true;

CREATE INDEX booksy_gmail_accounts_salon_id_idx
    ON public.booksy_gmail_accounts (salon_id);

CREATE INDEX booksy_gmail_accounts_salon_id_is_active_idx
    ON public.booksy_gmail_accounts (salon_id, is_active);

CREATE INDEX booksy_gmail_accounts_salon_id_auth_status_idx
    ON public.booksy_gmail_accounts (salon_id, auth_status);

DROP TRIGGER IF EXISTS handle_booksy_gmail_accounts_updated_at ON public.booksy_gmail_accounts;
CREATE TRIGGER handle_booksy_gmail_accounts_updated_at
BEFORE UPDATE ON public.booksy_gmail_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.booksy_gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booksy_gmail_accounts_select"
ON public.booksy_gmail_accounts
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_gmail_accounts_insert"
ON public.booksy_gmail_accounts
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_gmail_accounts_update"
ON public.booksy_gmail_accounts
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "booksy_gmail_accounts_delete"
ON public.booksy_gmail_accounts
FOR DELETE
USING (salon_id = public.get_user_salon_id());

REVOKE SELECT ON TABLE public.booksy_gmail_accounts FROM authenticated;

GRANT SELECT (
    id,
    salon_id,
    gmail_email,
    display_name,
    token_expires_at,
    auth_status,
    is_active,
    is_primary,
    last_auth_at,
    last_error,
    created_at,
    updated_at
) ON TABLE public.booksy_gmail_accounts TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.booksy_gmail_accounts TO authenticated;
