-- Migration: Restrict client_forms SELECT to owner/manager only
-- Purpose: GDPR need-to-know principle - employees should not browse encrypted health answers
-- Context: client_forms stores AES-256-GCM encrypted form answers (answers, answers_iv, answers_tag)
-- Previous policy: any role within the salon could SELECT
-- New policy: only owner and manager can read form answers
--
-- Note: employees can still initiate form sends (write is already restricted to owner/manager
-- in migration 20260305200000_fix_forms_plans_rls.sql).
-- If an employee needs to know WHETHER a form was submitted (not its content),
-- that should be derived from the booking record, not client_forms directly.

DROP POLICY IF EXISTS "client_forms_select" ON public.client_forms;

CREATE POLICY "client_forms_select" ON public.client_forms
    FOR SELECT USING (
        client_id IN (
            SELECT c.id
            FROM public.clients c
            WHERE c.salon_id = public.get_user_salon_id()
        )
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );
