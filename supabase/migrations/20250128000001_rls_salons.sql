-- ========================================
-- ROW LEVEL SECURITY: SALONS
-- Użytkownicy widzą tylko swój salon
-- ========================================

-- Włącz RLS dla tabeli salons
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

-- POLICY 1: Użytkownicy widzą TYLKO swój salon
CREATE POLICY "Users can view their own salon"
  ON public.salons 
  FOR SELECT
  TO authenticated
  USING (id = auth.get_user_salon_id());

-- POLICY 2: Tylko właściciel może edytować salon
CREATE POLICY "Salon owners can update their salon"
  ON public.salons 
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.get_user_salon_id() 
    AND auth.has_salon_role('owner')
  )
  WITH CHECK (
    id = auth.get_user_salon_id()
  );

-- POLICY 3: NIE pozwalamy tworzyć salonów przez API
-- (salony tworzone są tylko przez admin/setup)
-- Brak policy dla INSERT

-- POLICY 4: NIE pozwalamy usuwać salonów
-- (używamy soft delete lub admin operations)
-- Brak policy dla DELETE

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Users can view their own salon" ON public.salons IS 
'Użytkownicy mogą widzieć tylko dane swojego salonu.';

COMMENT ON POLICY "Salon owners can update their salon" ON public.salons IS 
'Tylko właściciele (role=owner) mogą aktualizować dane salonu.';
