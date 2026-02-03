-- Migration: Enable Custom Claims
-- Description: Syncs salon_id and role from public.profiles to auth.users.raw_app_meta_data
-- This allows RLS to function without querying the DB for user context.

-- 1. Function to sync claims
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER AS $$
BEGIN
  -- Update auth.users metadata
  -- Requires SECURITY DEFINER to access auth schema
  UPDATE auth.users
  SET raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'salon_id', NEW.salon_id,
      'role', NEW.role,
      'permissions', CASE WHEN NEW.role = 'owner' THEN '["*"]'::jsonb ELSE '[]'::jsonb END
    )
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger on profiles
DROP TRIGGER IF EXISTS on_profile_update ON public.profiles;

CREATE TRIGGER on_profile_update
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_claims();

-- 3. Backfill comments
COMMENT ON FUNCTION public.sync_user_claims IS 'Synchronizes public.profiles data to auth.users.raw_app_meta_data for performant RLS.';
