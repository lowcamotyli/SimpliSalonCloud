-- ========================================
-- TESTY MIGRACJI DATABASE FUNDAMENTALS
-- Execute in Supabase SQL Editor
-- ========================================

-- ========================================
-- TEST 1: Sprawdź czy wszystkie indeksy zostały utworzone
-- ========================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Oczekiwany wynik: Powinno być 14 indeksów z prefiksem idx_

-- ========================================
-- TEST 2: Sprawdź czy kolumny deleted_at i deleted_by istnieją
-- ========================================
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('deleted_at', 'deleted_by', 'version', 'updated_at')
ORDER BY table_name, column_name;

-- Oczekiwany wynik: Każda tabela (bookings, clients, employees, services, salons, payroll_runs)
-- powinna mieć kolumny: deleted_at, deleted_by, version, updated_at

-- ========================================
-- TEST 3: Sprawdź czy funkcje zostały utworzone
-- ========================================
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'soft_delete_booking',
    'soft_delete_client',
    'soft_delete_service',
    'check_version'
  )
ORDER BY routine_name;

-- Oczekiwany wynik: 4 funkcje

-- ========================================
-- TEST 4: Sprawdź czy triggery zostały utworzone
-- ========================================
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND (
    trigger_name LIKE '%soft_delete%' OR
    trigger_name LIKE '%version_check%'
  )
ORDER BY event_object_table, trigger_name;

-- Oczekiwany wynik: 6 triggerów (3 soft delete + 3 version check)

-- ========================================
-- TEST 5: Sprawdź constraints
-- ========================================
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'CHECK'
  AND tc.constraint_name LIKE '%_check%' OR tc.constraint_name LIKE '%_format%' OR tc.constraint_name LIKE '%_not_empty%' OR tc.constraint_name LIKE '%_positive%' OR tc.constraint_name LIKE '%_non_negative%'
ORDER BY tc.table_name, tc.constraint_name;

-- Oczekiwany wynik: Constraints dla bookings, clients, services, employees

-- ========================================
-- TEST 6: Test Soft Delete (PRAKTYCZNY)
-- ========================================

-- Najpierw znajdź jakiś booking (jeśli istnieje)
SELECT id, salon_id, client_id, deleted_at 
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 1;

-- Zapisz ID z powyższego wyniku i użyj go poniżej
-- UWAGA: Zamień 'YOUR_BOOKING_ID' na prawdziwe ID

-- Spróbuj usunąć booking (soft delete)
-- DELETE FROM bookings WHERE id = 'YOUR_BOOKING_ID';

-- Sprawdź czy został soft-deleted (deleted_at powinno być ustawione)
-- SELECT id, deleted_at, deleted_by FROM bookings WHERE id = 'YOUR_BOOKING_ID';

-- ========================================
-- TEST 7: Test Version Control (PRAKTYCZNY)
-- ========================================

-- Znajdź jakiś booking
SELECT id, version, notes 
FROM bookings 
WHERE deleted_at IS NULL 
LIMIT 1;

-- Zapisz ID i version z powyższego wyniku
-- UWAGA: Zamień wartości poniżej

-- Test 1: Update z poprawną wersją (POWINNO DZIAŁAĆ)
-- UPDATE bookings 
-- SET notes = 'Test update', version = 1  -- użyj aktualnej wersji
-- WHERE id = 'YOUR_BOOKING_ID';

-- Sprawdź czy version został zwiększony
-- SELECT id, version, notes, updated_at FROM bookings WHERE id = 'YOUR_BOOKING_ID';

-- Test 2: Update z niepoprawną wersją (POWINNO RZUCIĆ BŁĄD)
-- UPDATE bookings 
-- SET notes = 'Test update 2', version = 999  -- zła wersja
-- WHERE id = 'YOUR_BOOKING_ID';
-- Oczekiwany błąd: "Record has been modified by another user"

-- ========================================
-- TEST 8: Test Constraints (PRAKTYCZNY)
-- ========================================

-- Test 1: Spróbuj dodać booking z datą za daleko w przyszłości (POWINNO RZUCIĆ BŁĄD)
-- INSERT INTO bookings (salon_id, client_id, service_id, employee_id, booking_date, booking_time, status)
-- VALUES (
--   'YOUR_SALON_ID',
--   'YOUR_CLIENT_ID', 
--   'YOUR_SERVICE_ID',
--   'YOUR_EMPLOYEE_ID',
--   CURRENT_DATE + INTERVAL '2 years',  -- Za daleko!
--   '10:00',
--   'scheduled'
-- );
-- Oczekiwany błąd: "violates check constraint bookings_date_future_check"

-- Test 2: Spróbuj dodać klienta z niepoprawnym telefonem (POWINNO RZUCIĆ BŁĄD)
-- INSERT INTO clients (salon_id, client_code, full_name, phone)
-- VALUES (
--   'YOUR_SALON_ID',
--   'TEST001',
--   'Test Client',
--   'abc123'  -- Niepoprawny format!
-- );
-- Oczekiwany błąd: "violates check constraint clients_phone_format"

-- Test 3: Spróbuj dodać usługę z ujemną ceną (POWINNO RZUCIĆ BŁĄD)
-- INSERT INTO services (salon_id, name, category, subcategory, duration, price)
-- VALUES (
--   'YOUR_SALON_ID',
--   'Test Service',
--   'Test',
--   'Test',
--   30,
--   -10  -- Ujemna cena!
-- );
-- Oczekiwany błąd: "violates check constraint services_price_non_negative"

-- ========================================
-- TEST 9: Test wydajności indeksów
-- ========================================

-- Test EXPLAIN ANALYZE - sprawdź czy indeks jest używany
EXPLAIN ANALYZE
SELECT * FROM bookings 
WHERE salon_id = (SELECT id FROM salons LIMIT 1)
  AND booking_date = CURRENT_DATE
  AND deleted_at IS NULL;

-- W wyniku powinieneś zobaczyć:
-- "Index Scan using idx_bookings_salon_date"
-- To oznacza że indeks działa!

-- ========================================
-- TEST 10: Sprawdź statystyki tabel
-- ========================================

SELECT 
  schemaname,
  tablename,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('bookings', 'clients', 'services', 'employees')
ORDER BY tablename;

-- Powinieneś zobaczyć ostatnie czasy analizy tabel

-- ========================================
-- PODSUMOWANIE TESTÓW
-- ========================================

-- Wykonaj poniższe zapytanie aby zobaczyć podsumowanie:
SELECT 
  'Indeksy' as kategoria,
  COUNT(*) as liczba
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%'

UNION ALL

SELECT 
  'Funkcje' as kategoria,
  COUNT(*) as liczba
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('soft_delete_booking', 'soft_delete_client', 'soft_delete_service', 'check_version')

UNION ALL

SELECT 
  'Triggery' as kategoria,
  COUNT(*) as liczba
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND (trigger_name LIKE '%soft_delete%' OR trigger_name LIKE '%version_check%')

UNION ALL

SELECT 
  'Tabele z deleted_at' as kategoria,
  COUNT(DISTINCT table_name) as liczba
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'deleted_at'

UNION ALL

SELECT 
  'Tabele z version' as kategoria,
  COUNT(DISTINCT table_name) as liczba
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'version';

-- Oczekiwane wyniki:
-- Indeksy: 14
-- Funkcje: 4
-- Triggery: 6
-- Tabele z deleted_at: 6
-- Tabele z version: 4
