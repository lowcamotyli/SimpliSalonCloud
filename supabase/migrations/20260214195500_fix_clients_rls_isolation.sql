-- Fix: harden and normalize RLS for public.clients
-- Problem: cross-tenant read leak detected in runtime verification.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

-- Remove all existing policies on public.clients to avoid permissive leftovers.
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clients', policy_record.policyname);
  END LOOP;
END;
$$;

-- Recreate policies in strict tenant scope.
CREATE POLICY "clients_select_same_salon"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "clients_insert_same_salon"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = public.get_user_salon_id()
  );

CREATE POLICY "clients_update_same_salon"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
  );

CREATE POLICY "clients_delete_owner_manager_only"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- Safety: anonymous users should not touch clients.
REVOKE ALL ON TABLE public.clients FROM anon;

