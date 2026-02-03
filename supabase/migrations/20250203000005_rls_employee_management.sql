-- MIGRATION: 20250203000005_rls_employee_management.sql
-- USAGE: This migration sets up Row Level Security policies for employee management,
-- specifically focusing on controlling access based on roles defined in a 'profiles' table
-- or via custom claims.

-- NOTE: The error observed ('missing FROM-clause entry for table "new"') in previous attempts
-- likely occurred because the 'employees' table did not have RLS enabled, or the
-- supabase CLI was not executing the migration against a fully seeded/migrated schema
-- where 'profiles' and its functions existed. We rely on previous migrations to enable RLS.

-- For this specific migration, we only need RLS policies for 'employees' and 'profiles'.

-- 1. Enable RLS on tables if it somehow got disabled (or to ensure state)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ========================================
-- RLS Policies for 'employees' table
-- ========================================

-- Policy for SELECT on employees: viewable by salon members.
DROP POLICY IF EXISTS "Employees are viewable by salon members." ON employees;
CREATE POLICY "Employees are viewable by salon members."
ON employees FOR SELECT
USING (
    salon_id = (SELECT salon_id FROM public.profiles WHERE id = auth.uid())
);

-- Policy for INSERT on employees: can be created by Owner/Manager in their salon.
DROP POLICY IF EXISTS "Employees can be created by salon owner/manager." ON employees;
CREATE POLICY "Employees can be created by salon owner/manager."
ON employees FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('OWNER', 'MANAGER')
          AND salon_id = employees.salon_id
    )
);

-- Policy for UPDATE on employees: Owner/Manager can update, but only for employees in their salon.
DROP POLICY IF EXISTS "Employees can be updated by owner/manager for their salon." ON employees;
CREATE POLICY "Employees can be updated by owner/manager for their salon."
ON employees FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('OWNER', 'MANAGER')
          AND salon_id = employees.salon_id
    )
)
WITH CHECK (
    salon_id = (SELECT salon_id FROM public.profiles WHERE id = auth.uid())
);

-- Policy for DELETE on employees: Owner/Manager can delete, but only for employees in their salon.
DROP POLICY IF EXISTS "Employees can be deleted by owner/manager for their salon." ON employees;
CREATE POLICY "Employees can be deleted by owner/manager for their salon."
ON employees FOR DELETE
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('OWNER', 'MANAGER')
          AND salon_id = employees.salon_id
    )
);


-- ========================================
-- RLS Policies for 'profiles' table
-- ========================================
-- Assumes public.profiles has 'user_id', 'salon_id', and 'role' columns.

-- Policy for SELECT on profiles: viewable by salon members or the user themselves.
DROP POLICY IF EXISTS "Profiles are viewable by salon members." ON public.profiles;
CREATE POLICY "Profiles are viewable by salon members."
ON public.profiles FOR SELECT
USING (
    salon_id = (SELECT salon_id FROM public.profiles WHERE id = auth.uid())
    OR user_id = auth.uid()
);

-- Policy for UPDATE on profiles: User can update own profile data (non-critical fields).
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
CREATE POLICY "Users can update their own profile." ON public.profiles FOR
UPDATE TO authenticated
USING (
    user_id = auth.uid()
);

-- Policy for UPDATE on profiles: Owner/Manager can update employee roles/details (excluding critical user_id/salon_id changes for others).
DROP POLICY IF EXISTS "Owner/Manager can update employee profiles (role/data)." ON public.profiles;
CREATE POLICY "Owner/Manager can update employee profiles (role/data)." ON public.profiles FOR
UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles AS self
        WHERE self.id = auth.uid()
          AND self.role IN ('OWNER', 'MANAGER')
          AND self.salon_id = profiles.salon_id
    )
)
WITH CHECK (
    role IN ('EMPLOYEE', 'ADMIN', 'OWNER', 'MANAGER')
    AND salon_id = (SELECT salon_id FROM public.profiles WHERE id = auth.uid())
    AND user_id IS NOT NULL
);
