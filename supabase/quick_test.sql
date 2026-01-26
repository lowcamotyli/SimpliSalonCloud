-- ========================================
-- SZYBKIE TESTY - Skopiuj i wykonaj w Supabase SQL Editor
-- ========================================

-- TEST 1: Sprawdź indeksy
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Oczekiwany wynik: 14 indeksów
-- idx_bookings_client_id
-- idx_bookings_deleted_at
-- idx_bookings_employee_date
-- idx_bookings_employee_date_active
-- idx_bookings_employee_id
-- idx_bookings_salon_client
-- idx_bookings_salon_date
-- idx_bookings_service_id
-- idx_clients_deleted_at
-- idx_clients_salon_email
-- idx_clients_salon_phone
-- idx_employees_salon_active
-- idx_services_deleted_at
-- idx_services_salon_active
