-- ========================================
-- VERIFICATION SCRIPT FOR MIGRATIONS 20250127000000-20250127000003
-- ========================================
-- Run this in Supabase SQL Editor to verify all migrations are applied
-- This is a READ-ONLY verification script - makes no changes
-- ========================================
-- 1. VERIFY INDEXES (from 20250127000000)
-- ========================================
SELECT 'INDEXES' as check_type,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname IN (
        'idx_bookings_salon_date',
        'idx_bookings_salon_client',
        'idx_bookings_employee_date',
        'idx_bookings_employee_date_active',
        'idx_clients_salon_phone',
        'idx_clients_salon_email',
        'idx_services_salon_active',
        'idx_employees_salon_active',
        'idx_bookings_client_id',
        'idx_bookings_service_id',
        'idx_bookings_employee_id',
        'idx_bookings_deleted_at',
        'idx_clients_deleted_at',
        'idx_services_deleted_at'
    )
ORDER BY indexname;
-- Expected: 14 indexes total (11 from first migration + 3 from soft deletes)
-- ========================================
-- 2. VERIFY SOFT DELETE COLUMNS (from 20250127000001)
-- ========================================
SELECT 'SOFT_DELETE_COLUMNS' as check_type,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name IN (
        'salons',
        'clients',
        'employees',
        'services',
        'bookings',
        'payroll_runs'
    )
    AND column_name IN ('deleted_at', 'deleted_by')
ORDER BY table_name,
    column_name;
-- Expected: 12 rows (6 tables × 2 columns each)
-- deleted_at should be: timestamp with time zone, nullable
-- deleted_by should be: uuid, nullable
-- ========================================
-- 3. VERIFY VERSION CONTROL COLUMNS (from 20250127000002)
-- ========================================
SELECT 'VERSION_COLUMNS' as check_type,
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name IN ('bookings', 'clients', 'employees', 'services')
    AND column_name = 'version'
ORDER BY table_name;
-- Expected: 4 rows
-- version should be: integer, NOT NULL, default 1
-- ========================================
-- 4. VERIFY SOFT DELETE TRIGGERS
-- ========================================
SELECT 'SOFT_DELETE_TRIGGERS' as check_type,
    trigger_name,
    event_object_table,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
    AND trigger_name LIKE 'soft_delete_%_trigger'
ORDER BY trigger_name;
-- Expected: 3 rows (bookings, clients, services)
-- ========================================
-- 5. VERIFY VERSION CHECK TRIGGERS
-- ========================================
SELECT 'VERSION_TRIGGERS' as check_type,
    trigger_name,
    event_object_table,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%_version_check'
ORDER BY trigger_name;
-- Expected: 3 rows (bookings, clients, services)
-- ========================================
-- 6. VERIFY CONSTRAINTS (from 20250127000003)
-- ========================================
SELECT 'CONSTRAINTS' as check_type,
    conname as constraint_name,
    conrelid::regclass as table_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
    AND conname IN (
        'bookings_date_future_check',
        'bookings_status_check',
        'clients_phone_format',
        'clients_email_format',
        'clients_full_name_not_empty',
        'services_duration_positive',
        'services_price_non_negative',
        'services_name_not_empty',
        'employees_phone_format',
        'employees_email_format'
    )
ORDER BY table_name,
    constraint_name;
-- Expected: 10 constraints
-- ========================================
-- SUMMARY COUNTS
-- ========================================
SELECT 'SUMMARY' as check_type,
    (
        SELECT COUNT(*)
        FROM pg_indexes
        WHERE schemaname = 'public'
            AND indexname LIKE 'idx_%'
    ) as total_indexes,
    (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'deleted_at'
    ) as deleted_at_columns,
    (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'deleted_by'
    ) as deleted_by_columns,
    (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name = 'version'
    ) as version_columns,
    (
        SELECT COUNT(*)
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
            AND trigger_name LIKE 'soft_delete_%'
    ) as soft_delete_triggers,
    (
        SELECT COUNT(*)
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
            AND trigger_name LIKE '%_version_check'
    ) as version_triggers,
    (
        SELECT COUNT(*)
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
            AND contype = 'c'
    ) as check_constraints;
-- Expected Summary:
-- total_indexes: 14+ (should have at least the 14 we defined)
-- deleted_at_columns: 6 (salons, clients, employees, services, bookings, payroll_runs)
-- deleted_by_columns: 6
-- version_columns: 4 (bookings, clients, employees, services)
-- soft_delete_triggers: 3 (bookings, clients, services)
-- version_triggers: 3 (bookings, clients, services)
-- check_constraints: 10+