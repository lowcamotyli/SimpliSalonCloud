-- Migration: Harmonize RLS Helpers
-- Description: Updates public schema helpers to match auth schema optimized logic and ensures permissions.
-- 1. Update public.get_user_salon_id
CREATE OR REPLACE FUNCTION public.get_user_salon_id() RETURNS UUID AS $$
DECLARE jwt_salon_id TEXT;
profile_salon_id UUID;
BEGIN -- 1. Try JWT (Custom Claims)
BEGIN jwt_salon_id := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'salon_id';
EXCEPTION
WHEN OTHERS THEN jwt_salon_id := NULL;
END;
IF jwt_salon_id IS NOT NULL THEN RETURN jwt_salon_id::UUID;
END IF;
-- 2. Fallback: DB Lookup
SELECT salon_id INTO profile_salon_id
FROM public.profiles
WHERE user_id = auth.uid()
LIMIT 1;
RETURN profile_salon_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- 2. Update public.has_salon_role
CREATE OR REPLACE FUNCTION public.has_salon_role(required_role TEXT) RETURNS BOOLEAN AS $$
DECLARE jwt_role TEXT;
db_role TEXT;
user_salon_id UUID;
BEGIN -- 1. JWT Check
BEGIN jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
EXCEPTION
WHEN OTHERS THEN jwt_role := NULL;
END;
IF jwt_role IS NOT NULL THEN RETURN jwt_role = required_role;
END IF;
-- 2. DB Fallback
user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO db_role
FROM public.profiles
WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
LIMIT 1;
RETURN db_role = required_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- 3. Update public.has_any_salon_role
CREATE OR REPLACE FUNCTION public.has_any_salon_role(required_roles TEXT []) RETURNS BOOLEAN AS $$
DECLARE jwt_role TEXT;
db_role TEXT;
user_salon_id UUID;
BEGIN -- 1. JWT Check
BEGIN jwt_role := current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role';
EXCEPTION
WHEN OTHERS THEN jwt_role := NULL;
END;
IF jwt_role IS NOT NULL THEN RETURN jwt_role = ANY(required_roles);
END IF;
-- 2. DB Fallback
user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO db_role
FROM public.profiles
WHERE user_id = auth.uid()
    AND salon_id = user_salon_id
LIMIT 1;
RETURN db_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- 4. Ensure Permissions (Grant to authenticated role)
GRANT EXECUTE ON FUNCTION public.get_user_salon_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_salon_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_salon_role(TEXT []) TO authenticated;
COMMENT ON FUNCTION public.get_user_salon_id() IS 'Optimized helper to get salon_id from JWT or DB.';
COMMENT ON FUNCTION public.has_salon_role(TEXT) IS 'Optimized helper to check role from JWT or DB.';
COMMENT ON FUNCTION public.has_any_salon_role(TEXT []) IS 'Optimized helper to check multiple roles from JWT or DB.';