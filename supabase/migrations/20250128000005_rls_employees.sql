-- ========================================
-- ROW LEVEL SECURITY: EMPLOYEES
-- Owner/Manager mogą zarządzać, wszyscy mogą czytać
-- ========================================

-- Włącz RLS dla tabeli employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- POLICY 1: Wszyscy z salonu widzą pracowników
CREATE POLICY "Salon members can view employees"
  ON public.employees 
  FOR SELECT
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id() 
    AND deleted_at IS NULL
  );

-- POLICY 2: Tylko owner i manager mogą dodawać pracowników
CREATE POLICY "Owners and managers can create employees"
  ON public.employees 
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = auth.get_user_salon_id()
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- POLICY 3: Tylko owner i manager mogą edytować pracowników
CREATE POLICY "Owners and managers can update employees"
  ON public.employees 
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND deleted_at IS NULL
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    salon_id = auth.get_user_salon_id()
  );

-- POLICY 4: Tylko owner i manager mogą usuwać pracowników
CREATE POLICY "Owners and managers can delete employees"
  ON public.employees 
  FOR DELETE
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Salon members can view employees" ON public.employees IS 
'Wszyscy pracownicy salonu mogą przeglądać listę pracowników.';

COMMENT ON POLICY "Owners and managers can create employees" ON public.employees IS 
'Tylko właściciele i menedżerowie mogą dodawać nowych pracowników.';

COMMENT ON POLICY "Owners and managers can update employees" ON public.employees IS 
'Tylko właściciele i menedżerowie mogą edytować dane pracowników.';

COMMENT ON POLICY "Owners and managers can delete employees" ON public.employees IS 
'Tylko właściciele i menedżerowie mogą usuwać pracowników.';
