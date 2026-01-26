-- ========================================
-- INDEKSY DLA BOOKINGS
-- ========================================

-- Indeks 1: Listing bookings dla salonu na konkretny dzień
-- Używane w: Dashboard pokazujący dzisiejsze/jutrzejsze wizyty
-- Query: SELECT * FROM bookings WHERE salon_id = ? AND booking_date = ? ORDER BY booking_time
CREATE INDEX IF NOT EXISTS idx_bookings_salon_date 
ON bookings(salon_id, booking_date, booking_time);

-- Indeks 2: Booking history dla klienta
-- Używane w: Profil klienta - historia wizyt
-- Query: SELECT * FROM bookings WHERE salon_id = ? AND client_id = ? ORDER BY booking_date DESC
CREATE INDEX IF NOT EXISTS idx_bookings_salon_client 
ON bookings(salon_id, client_id, booking_date DESC);

-- Indeks 3: Schedule pracownika
-- Używane w: Kalendarz pracownika
-- Query: SELECT * FROM bookings WHERE employee_id = ? AND booking_date BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_bookings_employee_date 
ON bookings(employee_id, booking_date);

-- Indeks 4: Szukanie wolnych slotów (tylko aktywne bookings)
-- Używane w: Sprawdzanie dostępności przed utworzeniem bookingu
-- Note: end_time is calculated from booking_time + duration
CREATE INDEX IF NOT EXISTS idx_bookings_employee_date_active 
ON bookings(employee_id, booking_date, booking_time)
WHERE status NOT IN ('cancelled', 'no_show');

-- ========================================
-- INDEKSY DLA CLIENTS
-- ========================================

-- Indeks 5: Wyszukiwanie klienta po telefonie (unique)
-- Używane w: Booksy integration - znajdź lub utwórz klienta
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_salon_phone 
ON clients(salon_id, phone)
WHERE deleted_at IS NULL;

-- Indeks 6: Wyszukiwanie klienta po emailu
CREATE INDEX IF NOT EXISTS idx_clients_salon_email 
ON clients(salon_id, email)
WHERE deleted_at IS NULL AND email IS NOT NULL;

-- ========================================
-- INDEKSY DLA SERVICES
-- ========================================

-- Indeks 7: Tylko aktywne usługi
-- Używane w: Formularz tworzenia bookingu - dropdown usług
CREATE INDEX IF NOT EXISTS idx_services_salon_active 
ON services(salon_id, active)
WHERE active = true AND deleted_at IS NULL;

-- ========================================
-- INDEKSY DLA EMPLOYEES
-- ========================================

-- Indeks 8: Tylko aktywni pracownicy
CREATE INDEX IF NOT EXISTS idx_employees_salon_active 
ON employees(salon_id, active)
WHERE active = true AND deleted_at IS NULL;

-- ========================================
-- INDEKSY DLA FOREIGN KEYS (przyspiesza JOINy)
-- ========================================

-- Te indeksy pomagają gdy robisz JOIN lub sprawdzasz referencje
CREATE INDEX IF NOT EXISTS idx_bookings_client_id 
ON bookings(client_id);

CREATE INDEX IF NOT EXISTS idx_bookings_service_id 
ON bookings(service_id);

CREATE INDEX IF NOT EXISTS idx_bookings_employee_id 
ON bookings(employee_id);

-- ========================================
-- OPTYMALIZACJA - Analyze tables
-- ========================================

-- To mówi PostgreSQL żeby zaktualizował statystyki
-- Dzięki temu baza lepiej wybiera indeksy
ANALYZE bookings;
ANALYZE clients;
ANALYZE services;
ANALYZE employees;
