-- Fix: relax RLS policy for public.clients to allow soft-deletions
-- Problem: The 'clients_update_same_salon' policy had a WITH CHECK requiring deleted_at to be NULL,
--          which rejected soft-delete updates (where deleted_at is set to a timestamp).
BEGIN;
DROP POLICY IF EXISTS "clients_update_same_salon" ON public.clients;
CREATE POLICY "clients_update_same_salon" ON public.clients FOR
UPDATE TO authenticated USING (
        salon_id = public.get_user_salon_id()
        AND deleted_at IS NULL
    ) WITH CHECK (
        -- Relaxed check: as long as the tenant scope matches, you can update it.
        -- This allows setting deleted_at = NOW()
        salon_id = public.get_user_salon_id()
    );
COMMIT;