-- Fix: grant table access for employee_absences and time_reservations
-- Safe idempotent (tables may not exist yet on all environments)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employee_absences') THEN
    EXECUTE 'GRANT ALL ON TABLE public.employee_absences TO anon';
    EXECUTE 'GRANT ALL ON TABLE public.employee_absences TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.employee_absences TO service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'time_reservations') THEN
    EXECUTE 'GRANT ALL ON TABLE public.time_reservations TO anon';
    EXECUTE 'GRANT ALL ON TABLE public.time_reservations TO authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.time_reservations TO service_role';
  END IF;
END;
$$;
