-- Migration: Add Audit Logs
-- Description: Creates audit_logs table and generic trigger for tracking changes.

-- 1. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL, -- INSERT, UPDATE, DELETE, SOFT_DELETE
  old_values jsonb,
  new_values jsonb,
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz DEFAULT now()
);

-- 2. Indexes for Performance
CREATE INDEX IF NOT EXISTS audit_logs_salon_id_idx ON public.audit_logs(salon_id);
CREATE INDEX IF NOT EXISTS audit_logs_table_record_idx ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_logs_changed_at_idx ON public.audit_logs(changed_at);

-- 3. RLS for Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Owners can view audit logs for their salon
CREATE POLICY "Owners view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    salon_id = auth.get_user_salon_id() 
    AND auth.has_salon_role('owner')
  );

-- 4. Generic Audit Trigger Function
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
    
    -- Detect Soft Delete
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        v_operation := 'SOFT_DELETE';
    END IF;

    -- Extract salon_id safely
    BEGIN
        v_salon_id := OLD.salon_id;
    EXCEPTION WHEN OTHERS THEN
        v_salon_id := NULL;
    END;
    
  ELSIF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := null;
    v_record_id := OLD.id;
    BEGIN
        v_salon_id := OLD.salon_id;
    EXCEPTION WHEN OTHERS THEN v_salon_id := NULL; END;
    
  ELSIF (TG_OP = 'INSERT') THEN
    v_old_data := null;
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    BEGIN
        v_salon_id := NEW.salon_id;
    EXCEPTION WHEN OTHERS THEN v_salon_id := NULL; END;
  END IF;

  -- Insert log if salon_id matches (we only audit salon-scoped data for now)
  IF v_salon_id IS NOT NULL THEN
      INSERT INTO public.audit_logs (
        salon_id,
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        changed_by
      ) VALUES (
        v_salon_id,
        TG_TABLE_NAME::text,
        v_record_id,
        v_operation,
        v_old_data,
        v_new_data,
        auth.uid()
      );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Apply Triggers to Key Tables
DROP TRIGGER IF EXISTS audit_bookings ON bookings;
CREATE TRIGGER audit_bookings AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_employees ON employees;
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_services ON services;
CREATE TRIGGER audit_services AFTER INSERT OR UPDATE OR DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Note: Payroll tables need explicit audits too, adding later if schema exists
