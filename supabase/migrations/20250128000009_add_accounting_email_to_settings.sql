-- Add accounting_email to salon_settings
ALTER TABLE public.salon_settings
ADD COLUMN IF NOT EXISTS accounting_email TEXT;
COMMENT ON COLUMN public.salon_settings.accounting_email IS 'Email address specifically for payroll and accounting summaries.';

