-- ========================================
-- COMPLETE DATABASE MIGRATION
-- Execute this in Supabase SQL Editor
-- ========================================

-- ========================================
-- STEP 1: ADD SOFT DELETE COLUMNS FIRST
-- (Must be before indexes that use deleted_at)
-- ========================================

-- Add columns to all tables
ALTER TABLE salons 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

ALTER TABLE services 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

ALTER TABLE payroll_runs 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- ========================================
-- STEP 2: ADD VERSION CONTROL COLUMNS
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
-- STEP 3: ADD CRITICAL INDEXES
-- (Now that deleted_at columns exist)
-- ========================================

-- Indeks 1: Listing bookings dla salonu na konkretny dzień
CREATE INDEX IF NOT EXISTS idx_bookings_salon_date 
ON bookings(salon_id, booking_date, booking_time);

-- Indeks 2: Booking history dla klienta
CREATE INDEX IF NOT EXISTS idx_bookings_salon_client 
ON bookings(salon_id, client_id, booking_date DESC);

-- Indeks 3: Schedule pracownika
CREATE INDEX IF NOT EXISTS idx_bookings_employee_date 
ON bookings(employee_id, booking_date);

-- Indeks 4: Szukanie wolnych slotów (tylko aktywne bookings)
CREATE INDEX IF NOT EXISTS idx_bookings_employee_date_active 
ON bookings(employee_id, booking_date, booking_time)
WHERE status NOT IN ('cancelled', 'no_show');

-- Indeks 5: Wyszukiwanie klienta po telefonie (unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_salon_phone 
ON clients(salon_id, phone)
WHERE deleted_at IS NULL;

-- Indeks 6: Wyszukiwanie klienta po emailu
CREATE INDEX IF NOT EXISTS idx_clients_salon_email 
ON clients(salon_id, email)
WHERE deleted_at IS NULL AND email IS NOT NULL;

-- Indeks 7: Tylko aktywne usługi
CREATE INDEX IF NOT EXISTS idx_services_salon_active 
ON services(salon_id, active)
WHERE active = true AND deleted_at IS NULL;

-- Indeks 8: Tylko aktywni pracownicy
CREATE INDEX IF NOT EXISTS idx_employees_salon_active 
ON employees(salon_id, active)
WHERE active = true AND deleted_at IS NULL;

-- Indeksy dla foreign keys
CREATE INDEX IF NOT EXISTS idx_bookings_client_id 
ON bookings(client_id);

CREATE INDEX IF NOT EXISTS idx_bookings_service_id 
ON bookings(service_id);

CREATE INDEX IF NOT EXISTS idx_bookings_employee_id 
ON bookings(employee_id);

-- Add indexes for deleted_at
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at 
ON bookings(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at 
ON clients(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_deleted_at 
ON services(deleted_at) WHERE deleted_at IS NULL;

-- Analyze tables
ANALYZE bookings;
ANALYZE clients;
ANALYZE services;
ANALYZE employees;

-- ========================================
-- STEP 4: ADD SOFT DELETE FUNCTIONS & TRIGGERS
-- ========================================

-- Soft delete functions
CREATE OR REPLACE FUNCTION soft_delete_booking()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bookings 
  SET 
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Soft delete triggers
DROP TRIGGER IF EXISTS soft_delete_bookings_trigger ON bookings;
CREATE TRIGGER soft_delete_bookings_trigger
  BEFORE DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_booking();

DROP TRIGGER IF EXISTS soft_delete_clients_trigger ON clients;
CREATE TRIGGER soft_delete_clients_trigger
  BEFORE DELETE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_client();

DROP TRIGGER IF EXISTS soft_delete_services_trigger ON services;
CREATE TRIGGER soft_delete_services_trigger
  BEFORE DELETE ON services
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_service();

-- ========================================
-- STEP 5: ADD VERSION CONTROL FUNCTIONS & TRIGGERS
-- ========================================

-- Version checking function
CREATE OR REPLACE FUNCTION check_version()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.version != NEW.version THEN
      RAISE EXCEPTION 'Record has been modified by another user (expected version %, got %)', 
        OLD.version, NEW.version
        USING ERRCODE = 'P0001';
    END IF;
    
    NEW.version := OLD.version + 1;
    NEW.updated_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Version control triggers
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

-- ========================================
-- STEP 6: ADD CONSTRAINTS
-- ========================================

-- Bookings constraints
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_date_future_check,
  ADD CONSTRAINT bookings_date_future_check 
    CHECK (booking_date <= CURRENT_DATE + INTERVAL '1 year');

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check,
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending', 
      'confirmed', 
      'completed', 
      'cancelled', 
      'no_show',
      'scheduled'
    ));

-- Clients constraints
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_phone_format,
  ADD CONSTRAINT clients_phone_format 
    CHECK (phone ~ '^\+?[0-9]{9,15}$');

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_email_format,
  ADD CONSTRAINT clients_email_format
    CHECK (
      email IS NULL OR 
      email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
    );

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_full_name_not_empty,
  ADD CONSTRAINT clients_full_name_not_empty 
    CHECK (length(trim(full_name)) > 0);

-- Services constraints
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_duration_positive,
  ADD CONSTRAINT services_duration_positive 
    CHECK (duration > 0);

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_price_non_negative,
  ADD CONSTRAINT services_price_non_negative
    CHECK (price >= 0);

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_name_not_empty,
  ADD CONSTRAINT services_name_not_empty 
    CHECK (length(trim(name)) > 0);

-- Employees constraints
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_phone_format,
  ADD CONSTRAINT employees_phone_format 
    CHECK (phone ~ '^\+?[0-9]{9,15}$');

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_email_format,
  ADD CONSTRAINT employees_email_format
    CHECK (
      email IS NULL OR 
      email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
    );

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
