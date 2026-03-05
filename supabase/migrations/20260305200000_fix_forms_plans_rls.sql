-- Fix #6: client_forms_write policy -- restrict to owner/manager only
DROP POLICY IF EXISTS "client_forms_write" ON public.client_forms;
CREATE POLICY "client_forms_write" ON public.client_forms FOR ALL USING (
    client_id IN (
        SELECT c.id
        FROM public.clients c
        WHERE c.salon_id = public.get_user_salon_id()
    )
    AND public.has_any_salon_role(ARRAY ['owner', 'manager'])
);
-- Fix #10: beauty_plans -- split ALL into SELECT (all roles) + write (owner/manager only)
DROP POLICY IF EXISTS "beauty_plans_all" ON public.beauty_plans;
DROP POLICY IF EXISTS "beauty_plans_select" ON public.beauty_plans;
DROP POLICY IF EXISTS "beauty_plans_write" ON public.beauty_plans;
CREATE POLICY "beauty_plans_select" ON public.beauty_plans FOR
SELECT USING (
        client_id IN (
            SELECT c.id
            FROM public.clients c
            WHERE c.salon_id = public.get_user_salon_id()
        )
    );
CREATE POLICY "beauty_plans_write" ON public.beauty_plans FOR ALL USING (
    client_id IN (
        SELECT c.id
        FROM public.clients c
        WHERE c.salon_id = public.get_user_salon_id()
    )
    AND public.has_any_salon_role(ARRAY ['owner', 'manager'])
);
-- Fix #10: beauty_plan_steps -- split ALL into SELECT + write
DROP POLICY IF EXISTS "beauty_plan_steps_all" ON public.beauty_plan_steps;
DROP POLICY IF EXISTS "beauty_plan_steps_select" ON public.beauty_plan_steps;
DROP POLICY IF EXISTS "beauty_plan_steps_write" ON public.beauty_plan_steps;
CREATE POLICY "beauty_plan_steps_select" ON public.beauty_plan_steps FOR
SELECT USING (
        plan_id IN (
            SELECT bp.id
            FROM public.beauty_plans bp
                JOIN public.clients c ON c.id = bp.client_id
            WHERE c.salon_id = public.get_user_salon_id()
        )
    );
CREATE POLICY "beauty_plan_steps_write" ON public.beauty_plan_steps FOR ALL USING (
    plan_id IN (
        SELECT bp.id
        FROM public.beauty_plans bp
            JOIN public.clients c ON c.id = bp.client_id
        WHERE c.salon_id = public.get_user_salon_id()
    )
    AND public.has_any_salon_role(ARRAY ['owner', 'manager'])
);