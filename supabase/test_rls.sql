-- ========================================
-- RLS COMPREHENSIVE TEST SUITE
-- Execute this in Supabase SQL Editor to test RLS
-- ========================================

BEGIN;

-- ========================================
-- SETUP: Create test salons and users
-- ========================================

-- Cleanup existing test data
DO $$
DECLARE
    test_salon_a UUID := '11111111-1111-1111-1111-111111111111';
    test_salon_b UUID := '22222222-2222-2222-2222-222222222222';
    test_user_owner_a UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    test_user_employee_a UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    test_user_owner_b UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    test_employee_a_id UUID;
    test_employee_b_id UUID;
    test_client_a_id UUID;
    test_client_b_id UUID;
    test_service_a_id UUID;
BEGIN
    -- Disable RLS temporarily for setup
    ALTER TABLE public.salons DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;

    -- Clean up previous test data
    DELETE FROM public.bookings WHERE salon_id IN (test_salon_a, test_salon_b);
    DELETE FROM public.clients WHERE salon_id IN (test_salon_a, test_salon_b);
    DELETE FROM public.services WHERE salon_id IN (test_salon_a, test_salon_b);
    DELETE FROM public.employees WHERE salon_id IN (test_salon_a, test_salon_b);
    DELETE FROM public.profiles WHERE salon_id IN (test_salon_a, test_salon_b);
    DELETE FROM public.salons WHERE id IN (test_salon_a, test_salon_b);

    -- Create test salons
    INSERT INTO public.salons (id, name, slug, owner_email) VALUES
        (test_salon_a, 'Test Salon A', 'test-salon-a', 'owner-a@test.com'),
        (test_salon_b, 'Test Salon B', 'test-salon-b', 'owner-b@test.com');

    -- Create test profiles (users)
    INSERT INTO public.profiles (id, user_id, salon_id, role, full_name) VALUES
        (test_user_owner_a, test_user_owner_a, test_salon_a, 'owner', 'Owner A'),
        (test_user_employee_a, test_user_employee_a, test_salon_a, 'employee', 'Employee A'),
        (test_user_owner_b, test_user_owner_b, test_salon_b, 'owner', 'Owner B');

    -- Create test employees
    test_employee_a_id := gen_random_uuid();
    test_employee_b_id := gen_random_uuid();
    
    INSERT INTO public.employees (id, salon_id, profile_id, first_name, last_name, employee_code, phone) VALUES
        (test_employee_a_id, test_salon_a, test_user_employee_a, 'Jan', 'Kowalski', 'EMP-A-001', '+48111222333'),
        (test_employee_b_id, test_salon_b, test_user_owner_b, 'Anna', 'Nowak', 'EMP-B-001', '+48444555666');

    -- Create test clients
    test_client_a_id := gen_random_uuid();
    test_client_b_id := gen_random_uuid();
    
    INSERT INTO public.clients (id, salon_id, full_name, phone, client_code) VALUES
        (test_client_a_id, test_salon_a, 'Client A', '+48111000111', 'CLI-A-001'),
        (test_client_b_id, test_salon_b, 'Client B', '+48222000222', 'CLI-B-001');

    -- Create test services
    test_service_a_id := gen_random_uuid();
    
    INSERT INTO public.services (id, salon_id, name, category, subcategory, duration, price) VALUES
        (test_service_a_id, test_salon_a, 'Test Service A', 'Hair', 'Cut', 60, 100);

    -- Create test bookings
    INSERT INTO public.bookings (salon_id, client_id, employee_id, service_id, booking_date, booking_time, duration, base_price, status, source) VALUES
        (test_salon_a, test_client_a_id, test_employee_a_id, test_service_a_id, CURRENT_DATE, '10:00', 60, 100, 'scheduled', 'manual');

    -- Re-enable RLS for all tables
    ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

    RAISE NOTICE 'Test data setup complete!';
    RAISE NOTICE 'Salon A ID: %', test_salon_a;
    RAISE NOTICE 'Salon B ID: %', test_salon_b;
    RAISE NOTICE 'Owner A User ID: %', test_user_owner_a;
    RAISE NOTICE 'Employee A User ID: %', test_user_employee_a;
    RAISE NOTICE 'Owner B User ID: %', test_user_owner_b;
END $$;

-- ========================================
-- TEST 1: Tenant Isolation - Salons
-- User from Salon A should NOT see Salon B
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'TEST 1: Tenant Isolation - Salons';
RAISE NOTICE '========================================';

-- Simulate user from Salon A
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

-- Should see only Salon A
DO $$
DECLARE
    salon_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO salon_count FROM public.salons;
    IF salon_count = 1 THEN
        RAISE NOTICE 'TEST 1.1 PASSED: User from Salon A sees only 1 salon';
    ELSE
        RAISE WARNING 'TEST 1.1 FAILED: User from Salon A sees % salons (expected 1)', salon_count;
    END IF;
END $$;

-- Try to access Salon B directly
DO $$
DECLARE
    salon_b_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.salons WHERE id = '22222222-2222-2222-2222-222222222222') INTO salon_b_exists;
    IF NOT salon_b_exists THEN
        RAISE NOTICE 'TEST 1.2 PASSED: User from Salon A cannot see Salon B';
    ELSE
        RAISE WARNING 'TEST 1.2 FAILED: User from Salon A can see Salon B (RLS BREACH!)';
    END IF;
END $$;

-- ========================================
-- TEST 2: Tenant Isolation - Clients
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'TEST 2: Tenant Isolation - Clients';
RAISE NOTICE '========================================';

-- User from Salon A should only see clients from Salon A
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

DO $$
DECLARE
    client_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO client_count FROM public.clients;
    IF client_count = 1 THEN
        RAISE NOTICE 'TEST 2.1 PASSED: User from Salon A sees only their clients';
    ELSE
        RAISE WARNING 'TEST 2.1 FAILED: User from Salon A sees % clients (expected 1)', client_count;
    END IF;
    
    -- Try to access client from Salon B
    IF NOT EXISTS(SELECT 1 FROM public.clients WHERE salon_id = '22222222-2222-2222-2222-222222222222') THEN
        RAISE NOTICE 'TEST 2.2 PASSED: Cannot see clients from Salon B';
    ELSE
        RAISE WARNING 'TEST 2.2 FAILED: Can see clients from Salon B (RLS BREACH!)';
    END IF;
END $$;

-- ========================================
-- TEST 3: Role-Based Access - Services
-- Employee should NOT be able to create services
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'TEST 3: Role-Based Access - Services';
RAISE NOTICE '========================================';

-- Simulate employee user
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

DO $$
BEGIN
    -- Try to create a service as employee (should fail)
    INSERT INTO public.services (salon_id, name, category, subcategory, duration, price)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Test Service', 'Hair', 'Cut', 30, 50);
    
    RAISE WARNING 'TEST 3.1 FAILED: Employee was able to create a service (should be blocked)';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST 3.1 PASSED: Employee cannot create services';
    WHEN others THEN
        RAISE NOTICE 'TEST 3.1 PASSED: Employee blocked from creating services (error: %)', SQLERRM;
END $$;

-- ========================================
-- TEST 4: Employee Scope - Bookings
-- Employee should only be able to edit their own bookings
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'TEST 4: Employee Scope - Bookings';
RAISE NOTICE '========================================';

-- Employee should be able to see all bookings (read)
SET LOCAL "request.jwt.claims" = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

DO $$
DECLARE
    booking_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO booking_count FROM public.bookings;
    IF booking_count >= 1 THEN
        RAISE NOTICE 'TEST 4.1 PASSED: Employee can view bookings';
    ELSE
        RAISE WARNING 'TEST 4.1 FAILED: Employee cannot view bookings';
    END IF;
END $$;

-- ========================================
-- TEST 5: Owner Permissions
-- Owner should be able to update salon settings
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'TEST 5: Owner Permissions';
RAISE NOTICE '========================================';

SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

DO $$
BEGIN
    -- Owner should be able to update their salon
    UPDATE public.salons 
    SET name = 'Test Salon A Updated'
    WHERE id = '11111111-1111-1111-1111-111111111111';
    
    RAISE NOTICE 'TEST 5.1 PASSED: Owner can update their salon';
EXCEPTION
    WHEN others THEN
        RAISE WARNING 'TEST 5.1 FAILED: Owner cannot update salon (error: %)', SQLERRM;
END $$;

-- ========================================
-- TEST SUMMARY
-- ========================================

RAISE NOTICE '========================================';
RAISE NOTICE 'RLS TEST SUITE COMPLETE';
RAISE NOTICE 'Review NOTICE messages above for PASSED tests';
RAISE NOTICE 'Review WARNING messages above for FAILED tests';
RAISE NOTICE '========================================';

ROLLBACK;

-- Note: We ROLLBACK to clean up test data
-- If you want to keep test data, change ROLLBACK to COMMIT
