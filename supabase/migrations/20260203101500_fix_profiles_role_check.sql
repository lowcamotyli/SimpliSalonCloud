-- ========================================
-- FIX PROFILES ROLE CHECK (LOWERCASE ROLES)
-- ========================================
BEGIN;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'employee', 'admin'));

COMMIT;
