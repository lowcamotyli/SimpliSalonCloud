-- ========================================
-- ROW LEVEL SECURITY: SERVICES
-- Owner/Manager mogą zarządzać, wszyscy mogą czytać
-- ========================================

-- Włącz RLS dla tabeli services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- POLICY 1: Wszyscy z salonu widzą usługi
CREATE POLICY "Salon members can view services"
  ON public.services 
  FOR SELECT
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id() 
    AND deleted_at IS NULL
  );

-- POLICY 2: Tylko owner i manager mogą tworzyć usługi
CREATE POLICY "Owners and managers can create services"
  ON public.services 
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = auth.get_user_salon_id()
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- POLICY 3: Tylko owner i manager mogą edytować usługi
CREATE POLICY "Owners and managers can update services"
  ON public.services 
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

-- POLICY 4: Tylko owner i manager mogą usuwać usługi
CREATE POLICY "Owners and managers can delete services"
  ON public.services 
  FOR DELETE
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Salon members can view services" ON public.services IS 
'Wszyscy pracownicy salonu mogą przeglądać usługi.';

COMMENT ON POLICY "Owners and managers can create services" ON public.services IS 
'Tylko właściciele i menedżerowie mogą tworzyć nowe usługi.';

COMMENT ON POLICY "Owners and managers can update services" ON public.services IS 
'Tylko właściciele i menedżerowie mogą edytować usługi.';

COMMENT ON POLICY "Owners and managers can delete services" ON public.services IS 
'Tylko właściciele i menedżerowie mogą usuwać usługi.';
