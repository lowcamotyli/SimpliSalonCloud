-- Fix: start_time i end_time mogą być NULL gdy is_working = false
ALTER TABLE public.employee_schedules
ALTER COLUMN start_time DROP NOT NULL,
    ALTER COLUMN end_time DROP NOT NULL;