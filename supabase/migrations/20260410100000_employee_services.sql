CREATE TABLE
  public.employee_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    salon_id UUID NOT NULL REFERENCES salons (id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now (),
    CONSTRAINT employee_services_unique UNIQUE (salon_id, employee_id, service_id)
  );

ALTER TABLE public.employee_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow salon users to read employee_services" ON public.employee_services FOR
SELECT
  USING (salon_id = public.get_user_salon_id ());

CREATE POLICY "Allow salon users to insert employee_services" ON public.employee_services FOR INSERT
WITH
  CHECK (salon_id = public.get_user_salon_id ());

CREATE POLICY "Allow salon users to update employee_services" ON public.employee_services FOR UPDATE USING (salon_id = public.get_user_salon_id ())
WITH
  CHECK (salon_id = public.get_user_salon_id ());

CREATE POLICY "Allow salon users to delete employee_services" ON public.employee_services FOR DELETE USING (salon_id = public.get_user_salon_id ());

CREATE INDEX idx_employee_services_employee ON public.employee_services (salon_id, employee_id);

CREATE INDEX idx_employee_services_service ON public.employee_services (salon_id, service_id);
