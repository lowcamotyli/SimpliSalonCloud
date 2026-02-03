-- ========================================
-- ROW LEVEL SECURITY: CLIENTS
-- Wszyscy mogą czytać, owner/manager mogą usuwać
-- ========================================

-- Włącz RLS dla tabeli clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- POLICY 1: Wszyscy z salonu mogą CZYTAĆ klientów
CREATE POLICY "Salon members can view clients"
  ON public.clients 
  FOR SELECT
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND deleted_at IS NULL -- Tylko nieusunięci
  );

-- POLICY 2: Wszyscy z salonu mogą TWORZYĆ klientów
CREATE POLICY "Salon members can create clients"
  ON public.clients 
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = auth.get_user_salon_id()
  );

-- POLICY 3: Wszyscy z salonu mogą EDYTOWAĆ klientów
CREATE POLICY "Salon members can update clients"
  ON public.clients 
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    salon_id = auth.get_user_salon_id() -- Nie można zmienić salon_id
  );

-- POLICY 4: Tylko owner i manager mogą USUWAĆ klientów
CREATE POLICY "Owners and managers can delete clients"
  ON public.clients 
  FOR DELETE
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
    AND auth.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Salon members can view clients" ON public.clients IS 
'Wszyscy pracownicy salonu mogą przeglądać klientów (tylko nieusunięci).';

COMMENT ON POLICY "Salon members can create clients" ON public.clients IS 
'Wszyscy pracownicy salonu mogą dodawać nowych klientów.';

COMMENT ON POLICY "Salon members can update clients" ON public.clients IS 
'Wszyscy pracownicy salonu mogą edytować klientów.';

COMMENT ON POLICY "Owners and managers can delete clients" ON public.clients IS 
'Tylko właściciele i menedżerowie mogą usuwać klientów (soft delete).';
