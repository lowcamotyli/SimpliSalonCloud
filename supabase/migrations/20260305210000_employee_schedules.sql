-- ============================================================
-- Employee Schedules: regularne godziny tygodniowe per pracownik
-- ============================================================
CREATE TABLE public.employee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (
        day_of_week BETWEEN 0 AND 6
    ),
    -- 0=niedz, 1=pon ... 6=sob
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_working BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT employee_schedules_times_check CHECK (end_time > start_time),
    CONSTRAINT employee_schedules_unique UNIQUE (employee_id, day_of_week)
);
CREATE INDEX idx_employee_schedules_employee ON public.employee_schedules(employee_id);
CREATE INDEX idx_employee_schedules_salon ON public.employee_schedules(salon_id);
CREATE INDEX idx_employee_schedules_lookup ON public.employee_schedules(employee_id, day_of_week);
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
-- Pracownicy salonu mogą czytać grafiki
CREATE POLICY "salon_read_employee_schedules" ON public.employee_schedules FOR
SELECT USING (salon_id = public.get_user_salon_id());
-- Tylko owner/manager mogą edytować
CREATE POLICY "manager_write_employee_schedules" ON public.employee_schedules FOR ALL USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY ['owner', 'manager'])
);
-- ============================================================
-- Employee Schedule Exceptions: wyjątki na konkretne daty
-- ============================================================
CREATE TABLE public.employee_schedule_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    is_working BOOLEAN NOT NULL DEFAULT false,
    -- false = nieobecny
    start_time TIME,
    -- tylko gdy is_working = true
    end_time TIME,
    -- tylko gdy is_working = true
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT employee_exceptions_times_check CHECK (
        is_working = false
        OR (
            start_time IS NOT NULL
            AND end_time IS NOT NULL
            AND end_time > start_time
        )
    ),
    CONSTRAINT employee_exceptions_unique UNIQUE (employee_id, exception_date)
);
CREATE INDEX idx_employee_exceptions_employee ON public.employee_schedule_exceptions(employee_id);
CREATE INDEX idx_employee_exceptions_salon ON public.employee_schedule_exceptions(salon_id);
CREATE INDEX idx_employee_exceptions_date ON public.employee_schedule_exceptions(employee_id, exception_date);
ALTER TABLE public.employee_schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salon_read_employee_exceptions" ON public.employee_schedule_exceptions FOR
SELECT USING (salon_id = public.get_user_salon_id());
CREATE POLICY "manager_write_employee_exceptions" ON public.employee_schedule_exceptions FOR ALL USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY ['owner', 'manager'])
);
-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$;
CREATE TRIGGER employee_schedules_updated_at BEFORE
UPDATE ON public.employee_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER employee_exceptions_updated_at BEFORE
UPDATE ON public.employee_schedule_exceptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();