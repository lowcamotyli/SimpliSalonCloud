-- Migration: RBAC Implementation
-- 1. Updates sync_user_claims function to map roles to permissions in JWT.
-- 2. Updates RLS policies on public.profiles to allow role management by 'owner' (autoryzacja).

-- ========================================
-- 1. UPDATE public.sync_user_claims()
-- ========================================

CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER AS $$
DECLARE
  role_permissions jsonb;
BEGIN
  -- Define permissions based on role
  role_permissions := CASE NEW.role
    WHEN 'owner' THEN 
      '["*"]'::jsonb -- Wildcard
    WHEN 'manager' THEN 
      -- Manager permissions: View/Manage Calendar (All), Clients, Employees, View Finance
      '["calendar:view", "calendar:manage_all", "clients:view", "clients:manage", "employees:manage", "finance:view"]'::jsonb
    WHEN 'employee' THEN 
      -- Employee permissions: View Calendar, Manage Own Calendar, View/Manage Clients
      '["calendar:view", "calendar:manage_own", "clients:view", "clients:manage"]'::jsonb
    ELSE 
      '[]'::jsonb
  END;

  -- Update auth.users metadata
  UPDATE auth.users
  SET raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'salon_id', NEW.salon_id,
      'role', NEW.role,
      'permissions', role_permissions
    )
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_user_claims IS 'Synchronizes public.profiles data to auth.users.raw_app_meta_data, including RBAC permissions.';

-- ========================================
-- 2. UPDATE RLS for public.profiles (Uproszczona wersja - bez OLD/NEW)
-- ========================================

-- Dodajemy nową politykę, która pozwoli Ownerowi i Managerowi na edycję profili innych osób.
-- Kontrola, co dokładnie jest zmieniane (np. rola), zostanie przeniesiona do logiki API Next.js.
DROP POLICY IF EXISTS "Owner and Manager can update profiles in salon" ON public.profiles;

CREATE POLICY "Owner and Manager can update profiles in salon" ON public.profiles FOR
UPDATE TO authenticated
USING (
    -- Musi być w tym samym salonie
    salon_id = public.get_user_salon_id() 
    -- Tylko Owner i Manager mogą to robić
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    -- Nie można edytować WŁASNEGO profilu tą polityką (do tego jest inna)
    AND user_id != auth.uid() 
);

COMMENT ON POLICY "Owner and Manager can update profiles in salon" ON public.profiles 
IS 'Owners and Managers can update profiles of other salon members. Detailed role change validation must be done in API.';
