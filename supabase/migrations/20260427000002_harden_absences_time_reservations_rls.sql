-- Sprint 35: RLS hardening for employee_absences and time_reservations
-- employee: only own rows
-- owner/manager: all rows inside own salon

DROP POLICY IF EXISTS "Allow SELECT on employee_absences for salon members" ON public.employee_absences;
DROP POLICY IF EXISTS "Allow INSERT on employee_absences for salon members" ON public.employee_absences;
DROP POLICY IF EXISTS "Allow UPDATE on employee_absences for salon members" ON public.employee_absences;
DROP POLICY IF EXISTS "Allow DELETE on employee_absences for salon members" ON public.employee_absences;

DROP POLICY IF EXISTS "Allow SELECT on time_reservations for salon members" ON public.time_reservations;
DROP POLICY IF EXISTS "Allow INSERT on time_reservations for salon members" ON public.time_reservations;
DROP POLICY IF EXISTS "Allow UPDATE on time_reservations for salon members" ON public.time_reservations;
DROP POLICY IF EXISTS "Allow DELETE on time_reservations for salon members" ON public.time_reservations;

CREATE POLICY "employee_absences_select_scoped"
ON public.employee_absences
FOR SELECT
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);

CREATE POLICY "employee_absences_insert_scoped"
ON public.employee_absences
FOR INSERT
TO authenticated
WITH CHECK (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
  AND created_by = auth.uid()
);

CREATE POLICY "employee_absences_update_scoped"
ON public.employee_absences
FOR UPDATE
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
)
WITH CHECK (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);

CREATE POLICY "employee_absences_delete_scoped"
ON public.employee_absences
FOR DELETE
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);

CREATE POLICY "time_reservations_select_scoped"
ON public.time_reservations
FOR SELECT
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);

CREATE POLICY "time_reservations_insert_scoped"
ON public.time_reservations
FOR INSERT
TO authenticated
WITH CHECK (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
  AND created_by = auth.uid()
);

CREATE POLICY "time_reservations_update_scoped"
ON public.time_reservations
FOR UPDATE
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
)
WITH CHECK (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);

CREATE POLICY "time_reservations_delete_scoped"
ON public.time_reservations
FOR DELETE
TO authenticated
USING (
  salon_id = public.get_user_salon_id()
  AND (
    public.has_any_salon_role(ARRAY['owner', 'manager'])
    OR employee_id = public.get_user_employee_id()
  )
);
