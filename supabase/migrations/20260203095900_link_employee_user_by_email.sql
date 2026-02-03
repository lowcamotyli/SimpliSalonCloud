-- ========================================
-- LINK EMPLOYEE TO USER BY EMAIL
-- Creates a secure function to link employees.user_id to auth.users.id
-- ========================================
BEGIN;

CREATE OR REPLACE FUNCTION public.link_employee_to_user_by_email(
  employee_uuid UUID,
  user_email TEXT
) RETURNS TABLE (employee_id UUID, user_id UUID) AS $$
DECLARE
  target_user_id UUID;
  employee_record public.employees%ROWTYPE;
  profile_record public.profiles%ROWTYPE;
  normalized_email TEXT;
  full_name_value TEXT;
BEGIN
  IF user_email IS NULL OR length(trim(user_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF NOT public.has_any_salon_role(ARRAY['owner', 'manager']) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO employee_record
  FROM public.employees
  WHERE id = employee_uuid
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF employee_record.salon_id != public.get_user_salon_id() THEN
    RAISE EXCEPTION 'Employee belongs to a different salon';
  END IF;

  normalized_email := lower(trim(user_email));

  SELECT u.id
  INTO target_user_id
  FROM auth.users u
  WHERE lower(u.email) = normalized_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with this email not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = target_user_id
      AND e.id <> employee_uuid
  ) THEN
    RAISE EXCEPTION 'User already linked to another employee';
  END IF;

  UPDATE public.employees
  SET user_id = target_user_id
  WHERE id = employee_uuid;

  SELECT *
  INTO profile_record
  FROM public.profiles
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    full_name_value := trim(
      coalesce(employee_record.first_name, '') || ' ' || coalesce(employee_record.last_name, '')
    );

    IF full_name_value IS NULL OR length(full_name_value) = 0 THEN
      full_name_value := normalized_email;
    END IF;

    INSERT INTO public.profiles (user_id, salon_id, role, full_name)
    VALUES (target_user_id, employee_record.salon_id, 'employee', full_name_value)
    RETURNING * INTO profile_record;
  ELSE
    IF profile_record.salon_id <> employee_record.salon_id THEN
      RAISE EXCEPTION 'User belongs to a different salon';
    END IF;
  END IF;

  RETURN QUERY SELECT employee_record.id, target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.link_employee_to_user_by_email(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.link_employee_to_user_by_email(UUID, TEXT) IS
'Links employees.user_id to auth.users.id by email. Requires OWNER or MANAGER and same salon.';

COMMIT;
