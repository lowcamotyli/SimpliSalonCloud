-- Add mailbox_label column to booksy_gmail_accounts
-- Used in MailboxHealthCard UI to display a human-readable label per mailbox

ALTER TABLE public.booksy_gmail_accounts
  ADD COLUMN IF NOT EXISTS mailbox_label TEXT;
