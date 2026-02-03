-- ========================================
-- DODAJ KOLUMNY VERSION I UPDATED_AT
-- ========================================

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE services 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ========================================
-- FUNKCJA SPRAWDZANIA WERSJI
-- ========================================

CREATE OR REPLACE FUNCTION check_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Tylko dla UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Sprawdź czy wersja się zgadza
    -- OLD.version to wersja w bazie
    -- NEW.version to wersja którą wysłał user
    IF OLD.version != NEW.version THEN
      RAISE EXCEPTION 'Record has been modified by another user (expected version %, got %)', 
        OLD.version, NEW.version
        USING ERRCODE = 'P0001';
    END IF;
    
    -- Zwiększ wersję
    NEW.version := OLD.version + 1;
    
    -- Zaktualizuj timestamp
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TRIGGERY
-- ========================================

DROP TRIGGER IF EXISTS bookings_version_check ON bookings;
CREATE TRIGGER bookings_version_check
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_version();

DROP TRIGGER IF EXISTS clients_version_check ON clients;
CREATE TRIGGER clients_version_check
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION check_version();

DROP TRIGGER IF EXISTS services_version_check ON services;
CREATE TRIGGER services_version_check
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION check_version();

