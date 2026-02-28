BEGIN;

-- 1. Drop old broken policies with UPPERCASE role checks
DROP POLICY IF EXISTS "Employees can be created by salon owner/manager." ON public.employees;
DROP POLICY IF EXISTS "Employees can be updated by owner/manager for their salon." ON public.employees;
DROP POLICY IF EXISTS "Employees can be deleted by owner/manager for their salon." ON public.employees;
DROP POLICY IF EXISTS "Employees are viewable by salon members." ON public.employees;
DROP POLICY IF EXISTS "Owner/Manager can update employee profiles (role/data)." ON public.profiles;

-- 2. Recreate these policies using LOWERCASE roles and the helper functions

-- employees SELECT
CREATE POLICY "Employees are viewable by salon members."
  ON public.employees
  FOR SELECT
  USING (salon_id = public.get_user_salon_id() AND deleted_at IS NULL);

-- employees INSERT
CREATE POLICY "Employees can be created by salon owner/manager."
  ON public.employees
  FOR INSERT
  WITH CHECK (
    public.has_any_salon_role(ARRAY['owner', 'manager']) 
    AND salon_id = public.get_user_salon_id()
  );

-- employees UPDATE
CREATE POLICY "Employees can be updated by owner/manager for their salon."
  ON public.employees
  FOR UPDATE
  USING (
    public.has_any_salon_role(ARRAY['owner', 'manager']) 
    AND salon_id = public.get_user_salon_id() 
    AND deleted_at IS NULL
  );

-- employees DELETE
CREATE POLICY "Employees can be deleted by owner/manager for their salon."
  ON public.employees
  FOR DELETE
  USING (
    public.has_any_salon_role(ARRAY['owner', 'manager']) 
    AND salon_id = public.get_user_salon_id()
  );

-- profiles UPDATE for owner/manager
CREATE POLICY "Owner/Manager can update employee profiles (role/data)."
  ON public.profiles
  FOR UPDATE
  USING (
    public.has_any_salon_role(ARRAY['owner', 'manager']) 
    AND salon_id = public.get_user_salon_id()
  )
  WITH CHECK (
    role IN ('owner', 'manager', 'employee', 'admin')
  );

-- 3. CREATE OR REPLACE FUNCTION public.sync_user_claims()
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  v_permissions := CASE NEW.role
    WHEN 'owner' THEN '["*"]'::jsonb
    WHEN 'manager' THEN '["calendar:view","calendar:manage_all","clients:view","clients:manage","employees:manage","services:manage","finance:view","reports:view","settings:view"]'::jsonb
    WHEN 'employee' THEN '["calendar:view","calendar:manage_own","clients:view","services:view"]'::jsonb
    ELSE '[]'::jsonb
  END;

  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'salon_id', NEW.salon_id,
      'role', NEW.role,
      'permissions', v_permissions
    )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-sync all existing users by touching all profiles
DO $$ 
BEGIN 
  UPDATE public.profiles 
  SET updated_at = COALESCE(updated_at, now()) 
  WHERE role IS NOT NULL; 
END $$;

-- 5. Add comments on all new policies
COMMENT ON POLICY "Employees are viewable by salon members." ON public.employees IS 'Allows salon members to view active employees in their salon.';
COMMENT ON POLICY "Employees can be created by salon owner/manager." ON public.employees IS 'Allows owners and managers to create new employee records for their salon.';
COMMENT ON POLICY "Employees can be updated by owner/manager for their salon." ON public.employees IS 'Allows owners and managers to update active employee records in their salon.';
COMMENT ON POLICY "Employees can be deleted by owner/manager for their salon." ON public.employees IS 'Allows owners and managers to delete employee records in their salon.';
COMMENT ON POLICY "Owner/Manager can update employee profiles (role/data)." ON public.profiles IS 'Allows owners and managers to manage roles and data for profiles within their salon.';

COMMIT;
