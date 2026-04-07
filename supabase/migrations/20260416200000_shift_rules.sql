CREATE TABLE IF NOT EXISTS public.shift_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('fixed', 'alternating')),
  template_a_id UUID NOT NULL REFERENCES public.shift_templates(id),
  template_b_id UUID REFERENCES public.shift_templates(id),
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  reference_week DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_rules_employee ON public.shift_rules(employee_id);
CREATE INDEX idx_shift_rules_salon ON public.shift_rules(salon_id);

ALTER TABLE public.shift_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_rules_salon_access" ON public.shift_rules
  FOR ALL USING (salon_id = public.get_user_salon_id());
