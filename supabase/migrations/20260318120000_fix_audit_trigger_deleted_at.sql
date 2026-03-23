-- Fixes the audit_trigger_func to prevent errors on tables without a 'deleted_at' column.
-- The previous implementation directly accessed OLD.deleted_at and NEW.deleted_at,
-- which caused a "column does not exist" (42703) error when the trigger ran on tables
-- like 'salon_settings' that lack this field.
--
-- The fix replaces direct column access with a check on the JSONB representation of the
-- row data (v_old_data->>'deleted_at' and v_new_data->>'deleted_at'). This approach is
-- more resilient as it gracefully handles the absence of the 'deleted_at' key in the
-- JSONB object, returning NULL instead of raising an error.

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data jsonb;
  v_new_data jsonb;
  v_salon_id uuid;
  v_record_id uuid;
  v_operation text;
BEGIN
  v_operation := TG_OP;

  IF (TG_OP = 'UPDATE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := OLD.id;
    IF ((v_old_data->>'deleted_at') IS NULL AND (v_new_data->>'deleted_at') IS NOT NULL) THEN
      v_operation := 'SOFT_DELETE';
    END IF;
    BEGIN
      v_salon_id := OLD.salon_id;
    EXCEPTION WHEN OTHERS THEN v_salon_id := NULL; END;
  ELSIF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := null;
    v_record_id := OLD.id;
    BEGIN v_salon_id := OLD.salon_id; EXCEPTION WHEN OTHERS THEN v_salon_id := NULL; END;
  ELSIF (TG_OP = 'INSERT') THEN
    v_old_data := null;
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    BEGIN v_salon_id := NEW.salon_id; EXCEPTION WHEN OTHERS THEN v_salon_id := NULL; END;
  END IF;

  IF v_salon_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (salon_id, table_name, record_id, operation, old_values, new_values, changed_by)
    VALUES (v_salon_id, TG_TABLE_NAME::text, v_record_id, v_operation, v_old_data, v_new_data, auth.uid());
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
