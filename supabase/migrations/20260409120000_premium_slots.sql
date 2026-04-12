CREATE TABLE public.premium_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  service_ids UUID[],
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_modifier NUMERIC(5,2),
  requires_prepayment BOOLEAN NOT NULL DEFAULT false,
  segment_criteria JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX premium_slots_salon_id_date_idx
  ON public.premium_slots (salon_id, date);

ALTER TABLE public.premium_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premium_slots_select"
ON public.premium_slots
FOR SELECT
USING (salon_id = public.get_user_salon_id());

CREATE POLICY "premium_slots_insert"
ON public.premium_slots
FOR INSERT
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "premium_slots_update"
ON public.premium_slots
FOR UPDATE
USING (salon_id = public.get_user_salon_id())
WITH CHECK (salon_id = public.get_user_salon_id());

CREATE POLICY "premium_slots_delete"
ON public.premium_slots
FOR DELETE
USING (salon_id = public.get_user_salon_id());
