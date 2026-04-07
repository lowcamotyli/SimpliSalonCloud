-- Create shift_templates table
CREATE TABLE public.shift_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(salon_id, name)
);

-- Add indexes for shift_templates
CREATE INDEX idx_shift_templates_salon_is_active ON public.shift_templates(salon_id, is_active);

-- Enable RLS and add policies for shift_templates
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow SELECT on shift_templates for salon members"
ON public.shift_templates FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow INSERT on shift_templates for salon members"
ON public.shift_templates FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow UPDATE on shift_templates for salon members"
ON public.shift_templates FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow DELETE on shift_templates for salon members"
ON public.shift_templates FOR DELETE
USING (salon_id = public.get_user_salon_id());


-- Create employee_shifts table
CREATE TABLE public.employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    shift_template_id UUID REFERENCES public.shift_templates(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(salon_id, employee_id, date)
);

-- Add indexes for employee_shifts
CREATE INDEX idx_employee_shifts_salon_employee ON public.employee_shifts(salon_id, employee_id);
CREATE INDEX idx_employee_shifts_salon_date ON public.employee_shifts(salon_id, date);
CREATE INDEX idx_employee_shifts_salon_employee_date ON public.employee_shifts(salon_id, employee_id, date);

-- Enable RLS and add policies for employee_shifts
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow SELECT on employee_shifts for salon members"
ON public.employee_shifts FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow INSERT on employee_shifts for salon members"
ON public.employee_shifts FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow UPDATE on employee_shifts for salon members"
ON public.employee_shifts FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "Allow DELETE on employee_shifts for salon members"
ON public.employee_shifts FOR DELETE
USING (salon_id = public.get_user_salon_id());
