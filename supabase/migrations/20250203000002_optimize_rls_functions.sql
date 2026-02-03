-- Migration: Optimize RLS Functions
-- Description: Updates auth.get_user_salon_id and other helpers to prefer JWT Claims over DB lookups.

-- 1. Update get_user_salon_id
CREATE OR REPLACE FUNCTION auth.get_user_salon_id() RETURNS UUID AS $$
DECLARE 
  jwt_salon_id TEXT;
  profile_salon_id UUID;
BEGIN 
  -- 1. Try JWT (Custom Claims)
  -- claim location: app_metadata -> salon_id
  -- Note: Supabase puts custom claims in app_metadata
  BEGIN
    jwt_salon_id := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'salon_id';
  EXCEPTION WHEN OTHERS THEN
    jwt_salon_id := NULL;
  END;
  
  IF jwt_salon_id IS NOT NULL THEN 
    RETURN jwt_salon_id::UUID;
  END IF;
  
  -- 2. Fallback: DB Lookup (for backward compatibility)
  SELECT salon_id INTO profile_salon_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN profile_salon_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Update has_salon_role
CREATE OR REPLACE FUNCTION auth.has_salon_role(required_role TEXT) RETURNS BOOLEAN AS $$
DECLARE 
  jwt_role TEXT;
  db_role TEXT;
  user_salon_id UUID;
BEGIN 
  -- 1. JWT Check
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role = required_role;
  END IF;

  -- 2. DB Fallback
  user_salon_id := auth.get_user_salon_id();
  IF user_salon_id IS NULL THEN RETURN FALSE; END IF;
  
  SELECT role INTO db_role
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
  LIMIT 1;
  
  RETURN db_role = required_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Update has_any_salon_role
CREATE OR REPLACE FUNCTION auth.has_any_salon_role(required_roles TEXT[]) RETURNS BOOLEAN AS $$
DECLARE 
  jwt_role TEXT;
  db_role TEXT;
  user_salon_id UUID;
BEGIN 
  -- 1. JWT Check
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role = ANY(required_roles);
  END IF;

  -- 2. DB Fallback
  user_salon_id := auth.get_user_salon_id();
  IF user_salon_id IS NULL THEN RETURN FALSE; END IF;
  
  SELECT role INTO db_role
  FROM public.profiles
  WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
  LIMIT 1;
  
  RETURN db_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
