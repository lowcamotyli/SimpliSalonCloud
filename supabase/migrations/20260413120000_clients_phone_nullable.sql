-- Allow clients to be created without a phone number (e.g. Booksy import without phone)
ALTER TABLE clients
  ALTER COLUMN phone DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS clients_phone_format,
  ADD CONSTRAINT clients_phone_format
    CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{9,15}$');
