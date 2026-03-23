-- Create treatment_records table
CREATE TABLE IF NOT EXISTS public.treatment_records (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
    performed_at timestamptz NOT NULL DEFAULT now(),
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes_encrypted text,
    data_category text NOT NULL DEFAULT 'general'::text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT treatment_records_data_category_check CHECK ((data_category = ANY (ARRAY['general'::text, 'health'::text, 'sensitive_health'::text])))
);

-- Add Indexes
CREATE INDEX IF NOT EXISTS ix_treatment_records_salon_id_client_id ON public.treatment_records USING btree (salon_id, client_id);
CREATE INDEX IF NOT EXISTS ix_treatment_records_salon_id_booking_id ON public.treatment_records USING btree (salon_id, booking_id);
CREATE INDEX IF NOT EXISTS ix_treatment_records_salon_id_employee_id ON public.treatment_records USING btree (salon_id, employee_id);
CREATE INDEX IF NOT EXISTS ix_treatment_records_performed_at ON public.treatment_records USING btree (performed_at DESC);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS handle_treatment_records_updated_at ON public.treatment_records;
CREATE TRIGGER handle_treatment_records_updated_at
BEFORE UPDATE ON public.treatment_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.treatment_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow SELECT on treatment_records for salon members" ON public.treatment_records;
CREATE POLICY "Allow SELECT on treatment_records for salon members"
ON public.treatment_records
FOR SELECT
USING (
    salon_id = public.get_user_salon_id() AND
    (public.has_any_salon_role(ARRAY['owner', 'manager']) OR employee_id = public.get_user_employee_id())
);

DROP POLICY IF EXISTS "Allow INSERT on treatment_records for owner/manager" ON public.treatment_records;
CREATE POLICY "Allow INSERT on treatment_records for owner/manager"
ON public.treatment_records
FOR INSERT
WITH CHECK (
    salon_id = public.get_user_salon_id() AND
    public.has_any_salon_role(ARRAY['owner', 'manager'])
);

DROP POLICY IF EXISTS "Allow UPDATE on treatment_records for owner/manager" ON public.treatment_records;
CREATE POLICY "Allow UPDATE on treatment_records for owner/manager"
ON public.treatment_records
FOR UPDATE
USING (
    salon_id = public.get_user_salon_id() AND
    public.has_any_salon_role(ARRAY['owner', 'manager'])
)
WITH CHECK (
    salon_id = public.get_user_salon_id() AND
    public.has_any_salon_role(ARRAY['owner', 'manager'])
);

DROP POLICY IF EXISTS "Allow DELETE on treatment_records for owner" ON public.treatment_records;
CREATE POLICY "Allow DELETE on treatment_records for owner"
ON public.treatment_records
FOR DELETE
USING (
    salon_id = public.get_user_salon_id() AND
    public.has_salon_role('owner')
);
