-- Ensure GRANT access for employee_absences and time_reservations tables
-- (Missing from original migrations)
GRANT ALL ON TABLE public.employee_absences TO anon;
GRANT ALL ON TABLE public.employee_absences TO authenticated;
GRANT ALL ON TABLE public.employee_absences TO service_role;

GRANT ALL ON TABLE public.time_reservations TO anon;
GRANT ALL ON TABLE public.time_reservations TO authenticated;
GRANT ALL ON TABLE public.time_reservations TO service_role;

-- Force PostgREST schema cache reload
SELECT pg_notify('pgrst', 'reload schema');
