# Enterprise RLS & Database Upgrade Plan

**Data:** 2025-02-02
**Autor:** Senior Solutions Architect
**Status:** DRAFT
**Cel:** Podniesienie standardu bazy danych z poziomu "MVP" do "Enterprise" (Security, Performance, Auditability).

---

## 1. Executive Summary

Obecna implementacja Supabase jest **poprawna funkcjonalnie**, ale posiada krytyczne braki w wydajności i audytowalności wymagane w systemach klasy Enterprise SaaS.

**Główne ryzyka:**
1.  **Wydajność RLS (N+1 Query Problem):** Funkcja `auth.get_user_salon_id()` wykonuje zapytanie do tabeli `profiles` przy **każdym** dostępie do wiersza (jeśli claim nie jest w sesji). Przy 1000 rezerwacji oznacza to 1000 dodatkowych zapytań SQL w tle.
2.  **Brak Audytu:** Mechanizm `version` chroni przed nadpisaniem (Optimistic Locking), ale nie mówi **kto** i **co** zmienił w przeszłości. W systemach finansowych/kadrowych (Payroll) jest to niedopuszczalne.
3.  **Zależność od `public` schema:** RLS polega na tabelach w schemacie `public`, co jest ryzykowne przy błędnych politykach.

---

## 2. Szczegółowy Plan Naprawczy

### 2.1. Wdrożenie Custom Claims (Performance & Security)

Zamiast odpytywać bazę danych o rolę i salon użytkownika przy każdym zapytaniu, dane te będą zapisane w tokenie JWT (`app_metadata`).

**Architektura rozwiązania:**
1.  **Trigger na `public.profiles`:** Każda zmiana roli lub przypisania do salonu automatycznie aktualizuje `auth.users.raw_app_meta_data`.
2.  **Zmiana funkcji RLS:** Funkcje `auth.get_user_salon_id()` przestają robić `SELECT FROM profiles`, a jedynie czytają `current_setting('request.jwt.claims')`.

**Korzyści:**
- **0ms latency** na sprawdzanie uprawnień (dane są w pamięci procesu).
- Eliminacja tysięcy zapytań do bazy danych.

### 2.2. System Audit Log (Compliance)

Wdrożenie pełnego rejestrowania zmian (CDC - Change Data Capture) na poziomie bazy danych.

**Specyfikacja tabeli `audit_logs`:**
- `id`: uuid
- `table_name`: text
- `record_id`: uuid
- `operation`: INSERT / UPDATE / DELETE
- `old_values`: jsonb (stan przed zmianą)
- `new_values`: jsonb (stan po zmianie)
- `changed_by`: uuid (user_id)
- `changed_at`: timestamptz
- `salon_id`: uuid (dla łatwego filtrowania per tenant)

**Mechanizm:**
- Generyczny Trigger `audit_trigger` podpinany pod kluczowe tabele: `bookings`, `payroll`, `employees`, `settings`.
- Partycjonowanie tabeli `audit_logs` po dacie (opcjonalne w fazie 1, zalecane przy dużej skali).

### 2.3. Hardening RLS & Indexes

- **Indeksy:** Upewnienie się, że każda kolumna używana w RLS (`salon_id`, `employee_id`) posiada indeks B-Tree.
- **Leak Prevention:** Upewnienie się, że tenant (`salon_id`) jest zawsze wymuszany, nawet jeśli programista zapomni go dodać w `INSERT` (Trigger wymuszający spójność z kontekstem usera).

---

## 3. Specyfikacja Techniczna (SQL Drafts)

Poniżej znajdują się gotowe koncepcje migracji do wdrożenia.

### A. Custom Claims Hook (Poprawa Wydajności)

```sql
-- 1. Funkcja aktualizująca Claims
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'salon_id', NEW.salon_id,
      'role', NEW.role,
      'permissions', CASE WHEN NEW.role = 'owner' THEN '["*"]'::jsonb ELSE '[]'::jsonb END
    )
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger
CREATE TRIGGER on_profile_update
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_claims();
```

### B. Audit Logging System

```sql
CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid NOT NULL, -- Szybkie filtrowanie dla klienta
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL, -- INSERT, UPDATE, DELETE, SOFT_DELETE
  old_values jsonb,
  new_values jsonb,
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz DEFAULT now()
);

-- RLS dla Audit Logs (Tylko Owner widzi logi)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    salon_id = auth.get_user_salon_id() 
    AND auth.has_salon_role('owner')
  );
```

---

## 4. Roadmapa Wdrożenia

1.  **Przygotowanie Migracji (Code Mode):**
    - Stworzenie pliku `supabase/migrations/20250203000000_enable_custom_claims.sql`.
    - Stworzenie pliku `supabase/migrations/20250203000001_add_audit_logs.sql`.
2.  **Testy:**
    - Weryfikacja czy token JWT faktycznie zawiera nowe claimy po aktualizacji profilu.
    - Test obciążeniowy (benchmark) zapytań RLS przed i po zmianie.
3.  **Frontend Update:**
    - Aktualizacja `middleware.ts` i `supabase/server.ts` aby nie polegały na zapytaniach DB, lecz na sesji.

---

## 5. Decyzje Architektoniczne

| Obszar | Decyzja | Uzasadnienie |
|--------|---------|--------------|
| **Autoryzacja** | **JWT Custom Claims** | Uniezależnienie RLS od zapytań DB. Skalowalność. |
| **Historia Danych** | **Dedykowana tabela `audit_logs`** | `version` jest do concurrency, Audit Log jest do compliance i security. |
| **Role** | **Stringi w MetaData** | Na tym etapie proste stringi ('owner', 'manager') w metadanych są wystarczające i najszybsze. |
