-- ================================================
-- SEED TEST DATA FOR SIMPLISALON CLOUD
-- Execute this in the Supabase SQL Editor
-- ================================================

BEGIN;

-- 1. Create a Test Salon (if not exists or just a new one)
-- You can replace this ID with your existing salon_id if you prefer
DO $$
DECLARE
    v_salon_id UUID := '77777777-7777-7777-7777-777777777777';
    v_employee_1_id UUID := gen_random_uuid();
    v_employee_2_id UUID := gen_random_uuid();
    v_service_hair_id UUID := gen_random_uuid();
    v_service_nail_id UUID := gen_random_uuid();
    v_client_1_id UUID := gen_random_uuid();
    v_client_2_id UUID := gen_random_uuid();
BEGIN
    -- Cleanup existing test data for this specific test salon to allow re-runs
    DELETE FROM bookings WHERE salon_id = v_salon_id;
    DELETE FROM services WHERE salon_id = v_salon_id;
    DELETE FROM employees WHERE salon_id = v_salon_id;
    DELETE FROM clients WHERE salon_id = v_salon_id;
    DELETE FROM salons WHERE id = v_salon_id;

    -- Insert Salon (omitting subscription columns to use defaults)
    INSERT INTO salons (id, name, slug, owner_email)
    VALUES (v_salon_id, 'Salon Testowy "U Gosi"', 'salon-testowy', 'test@test.pl');

    -- 2. Insert Employees
    INSERT INTO employees (id, salon_id, first_name, last_name, email, phone, employee_code, active, base_salary, base_threshold, commission_rate)
    VALUES 
    (v_employee_1_id, v_salon_id, 'Małgorzata', 'Kowalska', 'gosia@test.pl', '+48111222333', 'EMP001', true, 4000, 10000, 15),
    (v_employee_2_id, v_salon_id, 'Piotr', 'Nowak', 'piotr@test.pl', '+48444555666', 'EMP002', true, 3500, 8000, 10);

    -- 3. Insert Services
    INSERT INTO services (id, salon_id, name, category, subcategory, duration, price, active, surcharge_allowed)
    VALUES 
    (v_service_hair_id, v_salon_id, 'Strzyżenie damskie', 'Fryzjer', 'Kobiety', 60, 150, true, true),
    (gen_random_uuid(), v_salon_id, 'Modelowanie', 'Fryzjer', 'Kobiety', 30, 80, true, false),
    (gen_random_uuid(), v_salon_id, 'Strzyżenie męskie', 'Fryzjer', 'Mężczyźni', 30, 70, true, false),
    (v_service_nail_id, v_salon_id, 'Manicure Hybrydowy', 'Paznokcie', 'Ręce', 90, 110, true, true);

    -- 4. Insert Clients
    INSERT INTO clients (id, salon_id, full_name, phone, email, client_code, visit_count)
    VALUES 
    (v_client_1_id, v_salon_id, 'Anna Nowakowska', '+48999888777', 'anna.n@o2.pl', 'C001', 5),
    (v_client_2_id, v_salon_id, 'Jan Zieliński', '+48555666777', 'jan.z@gmail.com', 'C002', 2),
    (gen_random_uuid(), v_salon_id, 'Katarzyna Wiśniewska', '+48123123123', 'kasia.w@test.pl', 'C003', 10);

    -- 5. Insert Bookings (Visits)
    -- Today's visits
    INSERT INTO bookings (id, salon_id, client_id, employee_id, service_id, booking_date, booking_time, duration, base_price, status, source, payment_method)
    VALUES 
    (gen_random_uuid(), v_salon_id, v_client_1_id, v_employee_1_id, v_service_hair_id, CURRENT_DATE, '09:00', 60, 150, 'scheduled', 'manual', 'cash'),
    (gen_random_uuid(), v_salon_id, v_client_2_id, v_employee_2_id, v_service_nail_id, CURRENT_DATE, '10:30', 90, 110, 'scheduled', 'manual', 'card');

    -- Yesterday's visit (completed)
    INSERT INTO bookings (id, salon_id, client_id, employee_id, service_id, booking_date, booking_time, duration, base_price, status, source, payment_method)
    VALUES 
    (gen_random_uuid(), v_salon_id, v_client_1_id, v_employee_1_id, v_service_hair_id, CURRENT_DATE - INTERVAL '1 day', '14:00', 60, 150, 'completed', 'manual', 'cash');

    -- Tomorrow's visit (confirmed)
    INSERT INTO bookings (id, salon_id, client_id, employee_id, service_id, booking_date, booking_time, duration, base_price, status, source)
    VALUES 
    (gen_random_uuid(), v_salon_id, v_client_2_id, v_employee_1_id, v_service_hair_id, CURRENT_DATE + INTERVAL '1 day', '11:00', 60, 150, 'confirmed', 'manual');

END $$;

COMMIT;

-- Informacje po wykonaniu
SELECT 'Data seeding completed successfully!' as message;
SELECT id, name FROM salons WHERE id = '77777777-7777-7777-7777-777777777777';
SELECT count(*) as employees_count FROM employees WHERE salon_id = '77777777-7777-7777-7777-777777777777';
SELECT count(*) as services_count FROM services WHERE salon_id = '77777777-7777-7777-7777-777777777777';
SELECT count(*) as clients_count FROM clients WHERE salon_id = '77777777-7777-7777-7777-777777777777';
SELECT count(*) as bookings_count FROM bookings WHERE salon_id = '77777777-7777-7777-7777-777777777777';
