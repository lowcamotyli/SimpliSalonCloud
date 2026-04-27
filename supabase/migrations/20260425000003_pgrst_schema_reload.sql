-- Force PostgREST schema cache reload after adding employee_absences and time_reservations
SELECT pg_notify('pgrst', 'reload schema');
