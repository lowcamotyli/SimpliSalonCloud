-- ========================================
-- RLS HELPER FUNCTIONS
-- Row Level Security pomocnicze funkcje
-- ========================================
-- Funkcja 1: Pobierz salon_id aktualnego użytkownika
-- Najpierw próbuje z JWT (szybsze), potem z profiles
CREATE OR REPLACE FUNCTION public.get_user_salon_id() RETURNS UUID AS $$
DECLARE jwt_salon_id TEXT;
profile_salon_id UUID;
BEGIN -- 1. Spróbuj pobrać z JWT (najszybsze)
BEGIN jwt_salon_id := current_setting('request.jwt.claims', true)::json->'user_metadata'->>'salon_id';
IF jwt_salon_id IS NOT NULL THEN RETURN jwt_salon_id::UUID;
END IF;
EXCEPTION
WHEN OTHERS THEN -- Ignoruj błędy parsowania JWT
END;
-- 2. Jeśli nie ma w JWT, pobierz z tabeli profiles
-- SECURITY DEFINER sprawia, że zapytanie omija RLS (jeśli właścicielem jest postgres)
SELECT salon_id INTO profile_salon_id
FROM public.profiles
WHERE user_id = auth.uid()
LIMIT 1;
RETURN profile_salon_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
COMMENT ON FUNCTION public.get_user_salon_id() IS 'Zwraca salon_id aktualnie zalogowanego użytkownika. Najpierw sprawdza JWT, potem tabelę profiles.';
-- Funkcja 2: Sprawdź czy user ma konkretną rolę
CREATE OR REPLACE FUNCTION public.has_salon_role(required_role TEXT) RETURNS BOOLEAN AS $$
DECLARE current_role TEXT;
user_salon_id UUID;
BEGIN user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO current_role
FROM public.profiles
WHERE user_id = auth.uid()
  AND salon_id = user_salon_id
LIMIT 1;
RETURN current_role = required_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
COMMENT ON FUNCTION public.has_salon_role(TEXT) IS 'Sprawdza czy aktualny użytkownik ma konkretną rolę w swoim salonie (owner, manager, employee).';
-- Funkcja 3: Sprawdź czy user ma KTÓRĄKOLWIEK z podanych ról
CREATE OR REPLACE FUNCTION public.has_any_salon_role(required_roles TEXT []) RETURNS BOOLEAN AS $$
DECLARE current_role TEXT;
user_salon_id UUID;
BEGIN user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN FALSE;
END IF;
SELECT role INTO current_role
FROM public.profiles
WHERE user_id = auth.uid()
  AND salon_id = user_salon_id
LIMIT 1;
RETURN current_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
COMMENT ON FUNCTION public.has_any_salon_role(TEXT []) IS 'Sprawdza czy aktualny użytkownik ma którąkolwiek z podanych ról w swoim salonie.';
-- Funkcja 4: Pobierz employee_id dla aktualnego użytkownika
-- UWAGA: Wymaga kolumny employees.user_id (dodanej w migracji 20250127000004)
CREATE OR REPLACE FUNCTION public.get_user_employee_id() RETURNS UUID AS $$
DECLARE emp_id UUID;
user_salon_id UUID;
BEGIN user_salon_id := public.get_user_salon_id();
IF user_salon_id IS NULL THEN RETURN NULL;
END IF;
SELECT id INTO emp_id
FROM public.employees
WHERE user_id = auth.uid()
  AND salon_id = user_salon_id
  AND deleted_at IS NULL
LIMIT 1;
RETURN emp_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
COMMENT ON FUNCTION public.get_user_employee_id() IS 'Zwraca employee_id dla aktualnie zalogowanego użytkownika (jeśli jest pracownikiem). Wymaga kolumny employees.user_id.';
-- ========================================
-- GRANT PERMISSIONS
-- ========================================
-- Upewnij się, że funkcje mogą być używane przez authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_salon_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_salon_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_salon_role(TEXT []) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_employee_id() TO authenticated;
-- ========================================
-- VERIFICATION QUERIES
-- Uruchom te zapytania w SQL Editor jako zalogowany użytkownik aby przetestować:
-- ========================================
-- SELECT public.get_user_salon_id();
-- SELECT public.has_salon_role('owner');
-- SELECT public.has_any_salon_role(ARRAY['owner', 'manager']);
-- SELECT public.get_user_employee_id();

