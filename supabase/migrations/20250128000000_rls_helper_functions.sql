-- ========================================
-- RLS HELPER FUNCTIONS
-- Row Level Security pomocnicze funkcje
-- ========================================

-- Funkcja 1: Pobierz salon_id aktualnego użytkownika
-- Najpierw próbuje z JWT (szybsze), potem z profiles
CREATE OR REPLACE FUNCTION auth.get_user_salon_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    -- Próbuj pobrać z JWT (szybsze, cached)
    (current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'salon_id')::UUID,
    -- Jeśli nie ma w JWT, pobierz z profiles
    (SELECT salon_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.get_user_salon_id() IS 
'Zwraca salon_id aktualnie zalogowanego użytkownika. Najpierw sprawdza JWT, potem tabelę profiles.';


-- Funkcja 2: Sprawdź czy user ma konkretną rolę
CREATE OR REPLACE FUNCTION auth.has_salon_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND salon_id = auth.get_user_salon_id()
      AND role = required_role
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.has_salon_role(TEXT) IS 
'Sprawdza czy aktualny użytkownik ma konkretną rolę w swoim salonie (owner, manager, employee).';


-- Funkcja 3: Sprawdź czy user ma KTÓRĄKOLWIEK z podanych ról
CREATE OR REPLACE FUNCTION auth.has_any_salon_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND salon_id = auth.get_user_salon_id()
      AND role = ANY(required_roles)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.has_any_salon_role(TEXT[]) IS 
'Sprawdza czy aktualny użytkownik ma którąkolwiek z podanych ról w swoim salonie.';


-- Funkcja 4: Pobierz employee_id dla aktualnego użytkownika
CREATE OR REPLACE FUNCTION auth.get_user_employee_id()
RETURNS UUID AS $$
  SELECT id 
  FROM public.employees 
  WHERE profile_id = auth.uid()
    AND salon_id = auth.get_user_salon_id()
    AND deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION auth.get_user_employee_id() IS 
'Zwraca employee_id dla aktualnie zalogowanego użytkownika (jeśli jest pracownikiem).';


-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Upewnij się, że funkcje mogą być używane przez authenticated users
GRANT EXECUTE ON FUNCTION auth.get_user_salon_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_salon_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.has_any_salon_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.get_user_employee_id() TO authenticated;


-- ========================================
-- VERIFICATION QUERIES
-- Uruchom te zapytania w SQL Editor jako zalogowany użytkownik aby przetestować:
-- ========================================

-- SELECT auth.get_user_salon_id();
-- SELECT auth.has_salon_role('owner');
-- SELECT auth.has_any_salon_role(ARRAY['owner', 'manager']);
-- SELECT auth.get_user_employee_id();
