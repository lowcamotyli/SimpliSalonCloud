-- ========================================
-- CONSTRAINTS DLA BOOKINGS
-- ========================================

-- Note: Removed bookings_times_check as end_time doesn't exist in schema
-- End time is calculated as booking_time + duration

-- Data nie może być więcej niż rok w przyszłość
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_date_future_check,
  ADD CONSTRAINT bookings_date_future_check 
    CHECK (booking_date <= CURRENT_DATE + INTERVAL '1 year');

-- Status musi być z listy
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

-- ========================================
-- CONSTRAINTS DLA CLIENTS
-- ========================================

-- Telefon musi być w poprawnym formacie
-- Format: +48123456789 lub 123456789 (9-15 cyfr)
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_phone_format,
  ADD CONSTRAINT clients_phone_format 
    CHECK (phone ~ '^\+?[0-9]{9,15}$');

-- Email musi być poprawny (jeśli podany)
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_email_format,
  ADD CONSTRAINT clients_email_format
    CHECK (
      email IS NULL OR 
      email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
    );

-- Note: Removed first_name and last_name constraints as clients table uses full_name column
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_full_name_not_empty,
  ADD CONSTRAINT clients_full_name_not_empty 
    CHECK (length(trim(full_name)) > 0);

-- ========================================
-- CONSTRAINTS DLA SERVICES
-- ========================================

-- Duration musi być dodatnie
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_duration_positive,
  ADD CONSTRAINT services_duration_positive 
    CHECK (duration > 0);

-- Cena nie może być ujemna
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_price_non_negative,
  ADD CONSTRAINT services_price_non_negative
    CHECK (price >= 0);

-- Nazwa nie może być pusta
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_name_not_empty,
  ADD CONSTRAINT services_name_not_empty 
    CHECK (length(trim(name)) > 0);

-- ========================================
-- CONSTRAINTS DLA EMPLOYEES
-- ========================================

-- Telefon w poprawnym formacie
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_phone_format,
  ADD CONSTRAINT employees_phone_format 
    CHECK (phone ~ '^\+?[0-9]{9,15}$');

-- Email poprawny (jeśli podany)
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_email_format,
  ADD CONSTRAINT employees_email_format
    CHECK (
      email IS NULL OR 
      email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
    );

