CREATE TABLE public.employee_absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT employee_absences_start_before_end CHECK (start_date <= end_date)
);

CREATE TABLE public.time_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    title TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT time_reservations_start_before_end CHECK (start_at < end_at)
);

CREATE INDEX idx_employee_absences_employee_start_end
ON public.employee_absences (employee_id, start_date, end_date);

CREATE INDEX idx_employee_absences_salon_start_date
ON public.employee_absences (salon_id, start_date);

CREATE INDEX idx_time_reservations_employee_start_end
ON public.time_reservations (employee_id, start_at, end_at);

CREATE INDEX idx_time_reservations_salon_start_at
ON public.time_reservations (salon_id, start_at);

ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow SELECT on employee_absences for salon members"
ON public.employee_absences FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow INSERT on employee_absences for salon members"
ON public.employee_absences FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow UPDATE on employee_absences for salon members"
ON public.employee_absences FOR UPDATE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow DELETE on employee_absences for salon members"
ON public.employee_absences FOR DELETE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow SELECT on time_reservations for salon members"
ON public.time_reservations FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow INSERT on time_reservations for salon members"
ON public.time_reservations FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow UPDATE on time_reservations for salon members"
ON public.time_reservations FOR UPDATE
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow DELETE on time_reservations for salon members"
ON public.time_reservations FOR DELETE
USING (salon_id = public.get_user_salon_id());
