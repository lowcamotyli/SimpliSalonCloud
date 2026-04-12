ALTER TABLE services
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN services.description IS 'Optional description visible to clients in public booking flow';
