CREATE TABLE public.form_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    fields JSONB NOT NULL DEFAULT '[]',
    requires_signature BOOLEAN NOT NULL DEFAULT false,
    gdpr_consent_text TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_templates_salon_id ON public.form_templates(salon_id);

CREATE TABLE public.service_forms (
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    form_template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, form_template_id)
);

CREATE TABLE public.client_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    form_template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
    answers BYTEA NOT NULL,
    answers_iv BYTEA NOT NULL,
    answers_tag BYTEA NOT NULL,
    signature_url TEXT,
    signed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    fill_token TEXT UNIQUE,
    fill_token_exp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_forms_client_id ON public.client_forms(client_id);
CREATE INDEX idx_client_forms_booking_id ON public.client_forms(booking_id);
CREATE INDEX idx_client_forms_fill_token ON public.client_forms(fill_token) WHERE fill_token IS NOT NULL;

CREATE TABLE public.beauty_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_beauty_plans_client_id ON public.beauty_plans(client_id);

CREATE TABLE public.beauty_plan_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.beauty_plans(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    planned_date DATE,
    notes TEXT,
    step_order INT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_beauty_plan_steps_plan_id ON public.beauty_plan_steps(plan_id);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beauty_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beauty_plan_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_templates_select" ON public.form_templates
    FOR SELECT USING (salon_id = public.get_user_salon_id());

CREATE POLICY "form_templates_write" ON public.form_templates
    FOR ALL USING (
        salon_id = public.get_user_salon_id() 
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );

CREATE POLICY "service_forms_select" ON public.service_forms
    FOR SELECT USING (
        form_template_id IN (SELECT id FROM public.form_templates WHERE salon_id = public.get_user_salon_id())
    );

CREATE POLICY "service_forms_write" ON public.service_forms
    FOR ALL USING (
        form_template_id IN (SELECT id FROM public.form_templates WHERE salon_id = public.get_user_salon_id())
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );

CREATE POLICY "client_forms_select" ON public.client_forms
    FOR SELECT USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
    );

CREATE POLICY "client_forms_write" ON public.client_forms
    FOR ALL USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
    );

CREATE POLICY "beauty_plans_all" ON public.beauty_plans
    FOR ALL USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
    );

CREATE POLICY "beauty_plan_steps_all" ON public.beauty_plan_steps
    FOR ALL USING (
        plan_id IN (
            SELECT bp.id 
            FROM public.beauty_plans bp 
            JOIN public.clients c ON c.id = bp.client_id 
            WHERE c.salon_id = public.get_user_salon_id()
        )
    );
