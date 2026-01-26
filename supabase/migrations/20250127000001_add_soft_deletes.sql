-- ========================================
-- DODAJ KOLUMNY SOFT DELETE DO WSZYSTKICH TABEL
-- ========================================

-- Dodaj do salons
ALTER TABLE salons 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Dodaj do clients
ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Dodaj do employees
ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Dodaj do services
ALTER TABLE services 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Dodaj do bookings
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- Dodaj do payroll_runs
ALTER TABLE payroll_runs 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- ========================================
-- INDEKSY DLA DELETED_AT
-- ========================================

-- Często filtrujemy WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at 
ON bookings(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at 
ON clients(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_deleted_at 
ON services(deleted_at) WHERE deleted_at IS NULL;

-- ========================================
-- FUNKCJA SOFT DELETE
-- ========================================

CREATE OR REPLACE FUNCTION soft_delete_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Zamiast DELETE, robimy UPDATE
  UPDATE bookings 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid() -- Funkcja Supabase zwracająca aktualnego usera
  WHERE id = OLD.id;
  
  -- Zwróć NULL żeby zapobiec faktycznemu DELETE
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- TRIGGERY SOFT DELETE
-- ========================================

-- Trigger dla bookings
DROP TRIGGER IF EXISTS soft_delete_bookings_trigger ON bookings;
CREATE TRIGGER soft_delete_bookings_trigger
  BEFORE DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_booking();

-- Powtórz dla innych tabel (clients, services, employees)
-- Najpierw skopiuj funkcję i zmień nazwę tabeli

CREATE OR REPLACE FUNCTION soft_delete_client()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS soft_delete_clients_trigger ON clients;
CREATE TRIGGER soft_delete_clients_trigger
  BEFORE DELETE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_client();

-- Services
CREATE OR REPLACE FUNCTION soft_delete_service()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE services 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS soft_delete_services_trigger ON services;
CREATE TRIGGER soft_delete_services_trigger
  BEFORE DELETE ON services
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_service();
