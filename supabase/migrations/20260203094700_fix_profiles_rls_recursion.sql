-- MIGRATION: 20260203094700_fix_profiles_rls_recursion.sql
-- Fix infinite recursion in profiles RLS by using SECURITY DEFINER helpers

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by salon members." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Owner/Manager can update employee profiles (role/data)." ON public.profiles;
DROP POLICY IF EXISTS "Users can view salon profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner and Manager can update profiles in salon" ON public.profiles;

CREATE POLICY "Profiles are viewable by salon members."
ON public.profiles FOR SELECT
USING (
  salon_id = public.get_user_salon_id()
  OR user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile."
ON public.profiles FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

CREATE POLICY "Owner/Manager can update employee profiles (role/data)."
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.has_any_salon_role(ARRAY['OWNER', 'MANAGER'])
  AND salon_id = public.get_user_salon_id()
)
WITH CHECK (
  role IN ('EMPLOYEE', 'ADMIN', 'OWNER', 'MANAGER')
  AND salon_id = public.get_user_salon_id()
  AND user_id IS NOT NULL
);
