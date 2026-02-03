-- ========================================
-- ADD EMPLOYEE-USER LINK
-- Connect employees to auth.users via user_id
-- ========================================
-- Add user_id column to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE
SET NULL;
-- Create unique index to ensure one employee per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id)
WHERE user_id IS NOT NULL;
-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_employees_user_id_lookup ON public.employees(user_id);
-- ========================================
-- MIGRATE EXISTING DATA (BEST EFFORT)
-- WARNING: This migration attempts to auto-link employees to user accounts
-- using email addresses. If email addresses do not match exactly, or if
-- you need to link via phone, you MUST manually link employees to users 
-- in the database or admin panel after deployment.
-- ========================================
-- Update employees.user_id based on matching email in auth.users
-- FIXED: Use CTE to prevent unique constraint violations if multiple employees match same user
WITH unique_matches AS (
  SELECT e.id as emp_id, u.id as usr_id,
         ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY e.created_at DESC) as rn
  FROM public.employees e
  JOIN auth.users u ON e.email = u.email
  WHERE e.user_id IS NULL
)
UPDATE public.employees e
SET user_id = um.usr_id
FROM unique_matches um
WHERE e.id = um.emp_id
  AND um.rn = 1
  AND NOT EXISTS (SELECT 1 FROM public.employees existing WHERE existing.user_id = um.usr_id);
-- ========================================
-- COMMENTS
-- ========================================
COMMENT ON COLUMN public.employees.user_id IS 'Reference to auth.users - links employee record to authenticated user account. NULL if employee does not have login access.';
-- ========================================
-- VERIFICATION
-- ========================================
-- Check if column was added successfully
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'employees' AND column_name = 'user_id';

