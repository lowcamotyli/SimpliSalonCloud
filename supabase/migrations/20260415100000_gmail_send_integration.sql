-- Create the gmail_send_credentials table
CREATE TABLE public.gmail_send_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid UNIQUE NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    email text NOT NULL,
    access_token_enc text NOT NULL,
    refresh_token_enc text NOT NULL,
    token_expiry timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments to the columns
COMMENT ON COLUMN public.gmail_send_credentials.email IS 'Connected Gmail address';
COMMENT ON COLUMN public.gmail_send_credentials.access_token_enc IS 'AES-256-GCM encrypted access token';
COMMENT ON COLUMN public.gmail_send_credentials.refresh_token_enc IS 'AES-256-GCM encrypted refresh token';
COMMENT ON COLUMN public.gmail_send_credentials.token_expiry IS 'When access token expires, nullable';


-- Create an index on the salon_id for faster lookups
CREATE INDEX idx_gmail_send_credentials_salon_id ON public.gmail_send_credentials(salon_id);

-- Add the updated_at trigger
DROP TRIGGER IF EXISTS handle_gmail_send_credentials_updated_at ON public.gmail_send_credentials;
CREATE TRIGGER handle_gmail_send_credentials_updated_at
BEFORE UPDATE ON public.gmail_send_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Alter the salons table to add the email_provider column
ALTER TABLE public.salons
ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'resend' CHECK (email_provider IN ('resend', 'gmail'));

-- Enable Row Level Security on the new table
ALTER TABLE public.gmail_send_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gmail_send_credentials
CREATE POLICY "Allow select for salon members"
ON public.gmail_send_credentials
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow insert for salon members"
ON public.gmail_send_credentials
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow update for salon members"
ON public.gmail_send_credentials
FOR UPDATE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow delete for salon members"
ON public.gmail_send_credentials
FOR DELETE
USING (salon_id = public.get_user_salon_id());
