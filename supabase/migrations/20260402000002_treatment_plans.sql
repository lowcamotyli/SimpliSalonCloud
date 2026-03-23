-- Create treatment_plans table
CREATE TABLE IF NOT EXISTS public.treatment_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
    protocol_id uuid REFERENCES public.treatment_protocols(id) ON DELETE SET NULL,
    name text NOT NULL,
    total_sessions integer NOT NULL CHECK (total_sessions > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    started_at timestamptz,
    completed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.treatment_plans IS 'Stores plans for a series of treatments for a client.';

-- Create treatment_sessions table
CREATE TABLE IF NOT EXISTS public.treatment_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
    salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    session_number integer NOT NULL,
    status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    treatment_record_id uuid REFERENCES public.treatment_records(id) ON DELETE SET NULL,
    scheduled_at timestamptz,
    completed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plan_id, session_number)
);

COMMENT ON TABLE public.treatment_sessions IS 'Individual sessions within a treatment plan.';

-- Create Indexes
CREATE INDEX IF NOT EXISTS ix_treatment_plans_salon_client ON public.treatment_plans (salon_id, client_id);
CREATE INDEX IF NOT EXISTS ix_treatment_sessions_plan_id ON public.treatment_sessions (plan_id);
CREATE INDEX IF NOT EXISTS ix_treatment_sessions_salon_booking ON public.treatment_sessions (salon_id, booking_id);

-- Trigger function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS on_treatment_plans_updated ON public.treatment_plans;
CREATE TRIGGER on_treatment_plans_updated
BEFORE UPDATE ON public.treatment_plans
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_treatment_sessions_updated ON public.treatment_sessions;
CREATE TRIGGER on_treatment_sessions_updated
BEFORE UPDATE ON public.treatment_sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- RLS for treatment_plans
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select access to salon members" ON public.treatment_plans;
CREATE POLICY "Allow select access to salon members"
ON public.treatment_plans FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "Allow insert for owners/managers" ON public.treatment_plans;
CREATE POLICY "Allow insert for owners/managers"
ON public.treatment_plans FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']));

DROP POLICY IF EXISTS "Allow update for owners/managers" ON public.treatment_plans;
CREATE POLICY "Allow update for owners/managers"
ON public.treatment_plans FOR UPDATE
USING (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']))
WITH CHECK (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']));

DROP POLICY IF EXISTS "Allow delete for owners" ON public.treatment_plans;
CREATE POLICY "Allow delete for owners"
ON public.treatment_plans FOR DELETE
USING (salon_id = public.get_user_salon_id() AND public.has_salon_role('owner'));

-- RLS for treatment_sessions
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select access to salon members" ON public.treatment_sessions;
CREATE POLICY "Allow select access to salon members"
ON public.treatment_sessions FOR SELECT
USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "Allow insert for owners/managers" ON public.treatment_sessions;
CREATE POLICY "Allow insert for owners/managers"
ON public.treatment_sessions FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']));

DROP POLICY IF EXISTS "Allow update for owners/managers" ON public.treatment_sessions;
CREATE POLICY "Allow update for owners/managers"
ON public.treatment_sessions FOR UPDATE
USING (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']))
WITH CHECK (salon_id = public.get_user_salon_id() AND public.has_any_salon_role(ARRAY['owner', 'manager']));

DROP POLICY IF EXISTS "Allow delete for owners" ON public.treatment_sessions;
CREATE POLICY "Allow delete for owners"
ON public.treatment_sessions FOR DELETE
USING (salon_id = public.get_user_salon_id() AND public.has_salon_role('owner'));
