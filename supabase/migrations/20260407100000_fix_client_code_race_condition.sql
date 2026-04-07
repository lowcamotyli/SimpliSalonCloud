-- Fix race condition: pg_advisory_xact_lock serializes concurrent code generation per salon

CREATE OR REPLACE FUNCTION public.generate_client_code(salon_uuid uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_client_code'), hashtext(salon_uuid::text));

  SELECT COALESCE(MAX(CAST(SUBSTRING(client_code FROM 2) AS INTEGER)), 0)
  INTO next_num
  FROM public.clients
  WHERE salon_id = salon_uuid
    AND client_code ~ '^C[0-9]+$';

  next_num := next_num + 1;
  new_code := 'C' || LPAD(next_num::TEXT, 3, '0');

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_employee_code(salon_uuid uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_employee_code'), hashtext(salon_uuid::text));

  SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 2) AS INTEGER)), 0)
  INTO next_num
  FROM public.employees
  WHERE salon_id = salon_uuid
    AND employee_code ~ '^E[0-9]+$';

  next_num := next_num + 1;
  new_code := 'E' || LPAD(next_num::TEXT, 3, '0');

  RETURN new_code;
END;
$$;
