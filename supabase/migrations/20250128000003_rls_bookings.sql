-- ========================================
-- ROW LEVEL SECURITY: BOOKINGS
-- Najbardziej złożone RLS - employee może edytować tylko swoje
-- ========================================

-- Włącz RLS dla tabeli bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- POLICY 1: CZYTANIE - wszyscy z salonu widzą wszystkie bookings
DROP POLICY IF EXISTS "Salon members can view all bookings" ON public.bookings;
CREATE POLICY "Salon members can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND deleted_at IS NULL
  );

-- POLICY 2: TWORZENIE - wszyscy z salonu mogą tworzyć bookings
DROP POLICY IF EXISTS "Salon members can create bookings" ON public.bookings;
CREATE POLICY "Salon members can create bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = public.get_user_salon_id()
  );

-- POLICY 3: EDYCJA - zależy od roli
-- - Owner/Manager mogą edytować wszystkie
-- - Employee może edytować tylko swoje (gdzie jest employee_id)
DROP POLICY IF EXISTS "Members can update relevant bookings" ON public.bookings;
CREATE POLICY "Members can update relevant bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND deleted_at IS NULL
    AND (
      -- Owner lub Manager - mogą wszystko
      public.has_any_salon_role(ARRAY['owner', 'manager'])
      OR 
      -- Employee - tylko swoje bookings
      employee_id = public.get_user_employee_id()
    )
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id() -- Nie można zmienić salonu
  );

-- POLICY 4: USUWANIE - tylko owner i manager
DROP POLICY IF EXISTS "Owners and managers can delete bookings" ON public.bookings;
CREATE POLICY "Owners and managers can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Salon members can view all bookings" ON public.bookings IS 
'Wszyscy pracownicy salonu mogą przeglądać wszystkie wizyty (read-only dla employees).';

COMMENT ON POLICY "Salon members can create bookings" ON public.bookings IS 
'Wszyscy pracownicy salonu mogą tworzyć nowe wizyty.';

COMMENT ON POLICY "Members can update relevant bookings" ON public.bookings IS 
'Owner/Manager mogą edytować wszystkie wizyty. Employee może edytować tylko swoje wizyty.';

COMMENT ON POLICY "Owners and managers can delete bookings" ON public.bookings IS 
'Tylko właściciele i menedżerowie mogą usuwać wizyty.';

