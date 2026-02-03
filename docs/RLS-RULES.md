# Row Level Security (RLS) - Zasady Dostępu

## 🎯 Co to jest RLS?

**Row Level Security (RLS)** to mechanizm PostgreSQL, który automatycznie filtruje dane na poziomie **wierszy** w bazie danych. 

### Bez RLS:
- ❌ Użytkownik znający URL API może pobrać dane dowolnego salonu
- ❌ Bezpieczeństwo zależy tylko od logiki aplikacji
- ❌ Jedno błąd w kodzie = naruszenie bezpieczeństwa

### Z RLS:
- ✅ PostgreSQL **automatycznie** filtruje dane
- ✅ Użytkownik z Salon A **NIGDY** nie zobaczy danych Salon B
- ✅ Podwójna warstwa ochrony: aplikacja + baza danych

---

## 🔐 Role w systemie

### Owner (Właściciel)
- ✅ Może **WSZYSTKO** w swoim salonie
- ✅ Zarządza payroll (wypłaty)
- ✅ Zarządza pracownikami, usługami, klientami
- ✅ Edytuje ustawienia salonu i integracje

### Manager (Menedżer)
- ✅ Może **PRAWIE WSZYSTKO** oprócz payroll
- ✅ Zarządza pracownikami, usługami, klientami
- ✅ Może edytować **wszystkie** bookings
- ❌ Nie może zarządzać payroll

### Employee (Pracownik)
- ✅ Widzi wszystkie bookings (read-only dla cudzych)
- ✅ Może edytować **TYLKO swoje** bookings
- ✅ Może tworzyć klientów i bookings
- ❌ Nie może edytować usług lub pracowników

---

## 🛠️ Funkcje pomocnicze

RLS używa specjalnych funkcji SQL do sprawdzania uprawnień:

### `auth.get_user_salon_id()`
**Zwraca:** `UUID` - ID salonu aktualnego użytkownika

**Użycie:**
```sql
-- W policy:
USING (salon_id = auth.get_user_salon_id())
```

**Jak działa:**
1. Najpierw sprawdza JWT token (szybkie, cached)
2. Jeśli brak w JWT, pobiera z tabeli `profiles`

---

### `auth.has_salon_role(role_name TEXT)`
**Zwraca:** `BOOLEAN` - czy user ma konkretną rolę

**Użycie:**
```sql
-- Tylko dla owner:
USING (auth.has_salon_role('owner'))
```

**Przykład:**
```sql
-- Pozwól tylko owner edytować ustawienia:
CREATE POLICY "Only owners update settings"
  ON salon_settings FOR UPDATE
  USING (auth.has_salon_role('owner'));
```

---

### `auth.has_any_salon_role(roles TEXT[])`
**Zwraca:** `BOOLEAN` - czy user ma którąkolwiek z podanych ról

**Użycie:**
```sql
-- Dla owner LUB manager:
USING (auth.has_any_salon_role(ARRAY['owner', 'manager']))
```

**Przykład:**
```sql
-- Owner i manager mogą usuwać klientów:
CREATE POLICY "Managers delete clients"
  ON clients FOR DELETE
  USING (auth.has_any_salon_role(ARRAY['owner', 'manager']));
```

---

### `auth.get_user_employee_id()`
**Zwraca:** `UUID` (lub NULL) - ID pracownika dla aktualnego użytkownika

**Użycie:**
```sql
-- Employee może edytować tylko swoje bookings:
USING (employee_id = auth.get_user_employee_id())
```

---

## 📋 Macierz uprawnień dla tabel

| Tabela | Owner | Manager | Employee |
|--------|-------|---------|----------|
| **salons** | Read, Update | Read | Read |
| **clients** | Full access | Full access | Read, Create, Update |
| **bookings** | Full access | Full access | Read all, Edit own only |
| **services** | Full access | Full access | Read only |
| **employees** | Full access | Full access | Read only |
| **salon_settings** | Full access | Read | Read |
| **salon_integrations** | Full access | Read | Read |

---

## 🧪 Testowanie RLS

### Szybki test w SQL Editor

```sql
-- 1. Ustaw kontekst użytkownika
SET LOCAL "request.jwt.claims" = '{"sub": "user-id-here"}';

-- 2. Spróbuj pobrać dane
SELECT * FROM clients;  -- Powinien pokazać tylko klientów TEGO salonu

-- 3. Spróbuj pobrać dane innego salonu
SELECT * FROM clients WHERE salon_id = 'other-salon-id';
-- OCZEKIWANY WYNIK: 0 rows (RLS zablokował)
```

### Kompleksowy test
Uruchom plik `supabase/test_rls.sql` w SQL Editor:
1. Otwórz Supabase Dashboard → SQL Editor
2. Wklej zawartość `test_rls.sql`
3. Uruchom
4. Sprawdź wyniki - wszystkie testy powinny pokazać **PASSED**

---

## ⚠️ WAŻNE - Zasady bezpieczeństwa

### ✅ DO:
- **Zawsze używaj** `auth.get_user_salon_id()` w policies
- **Zawsze testuj** RLS po zmianach w policies
- **Zawsze sprawdzaj** role przed operacjami wrażliwymi

### ❌ NIE:
- **NIE** usuwaj RLS policies - to główna linia obrony
- **NIE** wyłączaj RLS na produkcji
- **NIE** ufaj tylko aplikacji - RLS musi być aktywne

### 🔒 Podwójna ochrona
W application code **NIE MUSISZ** filtrować po `salon_id`:
```typescript
// ❌ PRZED (redundantne z RLS):
.select('*')
.eq('salon_id', userSalonId)

// ✅ TERAZ (RLS robi to automatycznie):
.select('*')
```

**Ale** możesz nadal filtrować dla czytelności kodu!

---

## 🚀 Jak działa w praktyce

### Przykład: Employee próbuje edytować cudzy booking

```sql
-- User: Employee Jan (salon A, employee_id = 'jan-id')
-- Próbuje edytować booking Anny (employee_id = 'anna-id')

UPDATE bookings 
SET notes = 'Zmieniam cudzy booking!'
WHERE id = 'anna-booking-id';

-- PostgreSQL sprawdza policy:
-- ✓ salon_id = auth.get_user_salon_id() ? TAK (ten sam salon)
-- ✓ deleted_at IS NULL ? TAK
-- ✓ auth.has_any_salon_role(['owner', 'manager']) ? NIE (Jan jest employee)
-- ✓ employee_id = auth.get_user_employee_id() ? NIE ('anna-id' != 'jan-id')

-- WYNIK: 0 rows updated (RLS zablokował)
```

### Przykład: Owner edytuje dowolny booking

```sql
-- User: Owner Maria (salon A, role = 'owner')
-- Próbuje edytować booking Anny

UPDATE bookings 
SET notes = 'Owner może wszystko'
WHERE id = 'anna-booking-id';

-- PostgreSQL sprawdza policy:
-- ✓ salon_id = auth.get_user_salon_id() ? TAK
-- ✓ deleted_at IS NULL ? TAK
-- ✓ auth.has_any_salon_role(['owner', 'manager']) ? TAK (Maria jest owner)

-- WYNIK: 1 row updated (SUCCESS!)
```

---

## 📝 Dostępne migracje

Wszystkie RLS policies są w plikach:

1. `20250128000000_rls_helper_functions.sql` - Funkcje pomocnicze
2. `20250128000001_rls_salons.sql` - RLS dla salons
3. `20250128000002_rls_clients.sql` - RLS dla clients
4. `20250128000003_rls_bookings.sql` - RLS dla bookings (najbardziej złożone)
5. `20250128000004_rls_services.sql` - RLS dla services
6. `20250128000005_rls_employees.sql` - RLS dla employees
7. `20250128000006_rls_settings_integrations.sql` - RLS dla settings i integrations

---

## 🔧 Rozwiązywanie problemów

### Problem: "Policy violation" error
**Rozwiązanie:** Sprawdź czy user ma odpowiednią rolę w tabeli `profiles`

### Problem: User nie widzi swoich danych
**Rozwiązanie:** Sprawdź czy `salon_id` w profilu użytkownika jest ustawiony poprawnie:
```sql
SELECT id, salon_id, role FROM profiles WHERE user_id = auth.uid();
```

### Problem: Funkcje RLS zwracają NULL
**Rozwiązanie:** Upewnij się że user jest zalogowany:
```sql
SELECT auth.uid();  -- Powinno zwrócić UUID użytkownika
```

---

## 📚 Więcej informacji

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
