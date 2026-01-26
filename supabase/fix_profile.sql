-- ========================================
-- FIX: Sprawdź i napraw profil użytkownika
-- ========================================

-- KROK 1: Sprawdź czy użytkownik istnieje w auth.users
SELECT 
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'bartosz.rogala@yahoo.pl';

-- KROK 2: Sprawdź czy ma profil
SELECT 
  id,
  user_id,
  salon_id,
  role
FROM profiles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'bartosz.rogala@yahoo.pl'
);

-- KROK 3: Jeśli NIE MA profilu, utwórz go
-- (Zamień 'USER_ID' na ID z KROKU 1)
-- (Zamień 'SALON_ID' na ID salonu)

-- Najpierw znajdź salon_id:
SELECT id, name FROM salons LIMIT 5;

-- Potem utwórz profil:
/*
INSERT INTO profiles (user_id, salon_id, role)
VALUES (
  'USER_ID_Z_KROKU_1',
  'SALON_ID_Z_POWYZSZEGO',
  'owner'
);
*/

-- KROK 4: Sprawdź ponownie
SELECT 
  p.id,
  p.user_id,
  p.salon_id,
  p.role,
  s.name as salon_name,
  u.email
FROM profiles p
JOIN salons s ON s.id = p.salon_id
JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'bartosz.rogala@yahoo.pl';
