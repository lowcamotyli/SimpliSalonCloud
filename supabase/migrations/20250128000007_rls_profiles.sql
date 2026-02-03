-- ========================================
-- ROW LEVEL SECURITY: PROFILES
-- Użytkownicy widzą tylko profile z swojego salonu
-- ========================================

-- Włącz RLS dla tabeli profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- POLICY 1: Użytkownicy widzą tylko profile z swojego salonu
CREATE POLICY "Users can view salon profiles"
  ON public.profiles 
  FOR SELECT
  TO authenticated
  USING (
    salon_id = auth.get_user_salon_id()
  );

-- POLICY 2: Użytkownicy mogą aktualizować swój profil
CREATE POLICY "Users can update their own profile"
  ON public.profiles 
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND salon_id = auth.get_user_salon_id() -- Nie można zmienić salonu
  );

-- POLICY 3: NIE pozwalamy tworzyć profili przez API
-- (profile tworzone są automatycznie przy rejestracji)
-- Brak policy dla INSERT

-- POLICY 4: NIE pozwalamy usuwać profili
-- Brak policy dla DELETE

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON POLICY "Users can view salon profiles" ON public.profiles IS 
'Użytkownicy mogą widzieć tylko profile z tego samego salonu.';

COMMENT ON POLICY "Users can update their own profile" ON public.profiles IS 
'Użytkownicy mogą edytować tylko swój własny profil (nie mogą zmienić salon_id).';
