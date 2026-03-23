# Plan wgrania migracji na PROD

**Data przygotowania:** 2026-03-23
**Status:** GOTOWY DO WYKONANIA — stan PROD zweryfikowany
**PROD project:** `ubkueiwelarplnbhqmoa`
**Staging project:** `bxkxvrhspklpkkgmzcge` (CLI linked — przywrócony po analizie)

---

## STAN FAKTYCZNY PROD (zweryfikowany 2026-03-23)

### Migracje brakujące na PROD — dokładnie 7:

| # | Migracja | Co robi |
|---|----------|---------|
| 1 | `20260318120000_fix_audit_trigger_deleted_at` | Naprawa funkcji `audit_trigger_func()` — bug fix |
| 2 | `20260318130000_vouchers` | Nowe tabele: `vouchers`, `voucher_transactions` |
| 3 | `20260319144000_add_voucher_payment_method` | Dodaje `voucher` do CHECK constraint na `bookings.payment_method` |
| 4 | `20260320123006_create_group_booking_atomic` | Nowa funkcja SQL dla multi-bookingów |
| 5 | `20260404000001_service_addons` | Nowe tabele: `service_addons`, `booking_addons` |
| 6 | `20260408000000_replace_equipment_services_atomic` | Nowa funkcja SQL dla equipment-services |
| 7 | `20260409100000_fix_create_booking_atomic_overlap` | Naprawa `create_booking_atomic` — fix wykrywania nakładających się wizyt |

### Weryfikacje wykonane — wyniki:

| Sprawdzenie | Wynik | Wpływ na plan |
|-------------|-------|---------------|
| Plany w `subscriptions` | tylko `enterprise` (1 wiersz) | `rename_plan_types` już na PROD ✅ |
| Plany w `salons` | `solo` (14) + `enterprise` (6) | `rename_plan_types` już na PROD ✅ |
| Tabela `vouchers` istnieje? | **NIE** | Migracja wykona się normalnie, bez `repair` |
| Tabela `service_addons` istnieje? | **NIE** | Migracja wykona się normalnie, bez `repair` |
| Constraint `bookings_payment_method_check` | Istnieje, wartości: `cash, card, transfer, other` | Nazwa i wartości się zgadzają ✅ |

---

## ANALIZA RYZYKA — KAŻDA MIGRACJA

### ✅ 20260318120000 — fix_audit_trigger_deleted_at
- **Operacja:** `CREATE OR REPLACE FUNCTION audit_trigger_func()`
- **Dane:** Brak zmian w danych. Tylko zastąpienie funkcji SQL.
- **Ryzyko:** Zerowe. Idempotentna.

### ✅ 20260318130000 — vouchers
- **Operacja:** `CREATE TABLE vouchers`, `CREATE TABLE voucher_transactions` + RLS
- **Dane:** Tabele nie istnieją na PROD — tworzy nowe, puste tabele.
- **Ryzyko:** Zerowe. Addytywne.
- **Uwaga:** Brak `IF NOT EXISTS` w SQL, ale tabele potwierdzone jako nieistniejące.

### ✅ 20260319144000 — add_voucher_payment_method
- **Operacja:** `DROP CONSTRAINT bookings_payment_method_check` + `ADD CONSTRAINT` z `voucher`
- **Dane:** Modyfikuje constraint, nie dane. Żaden istniejący booking nie ma `payment_method = 'voucher'` (funkcja jest nowa), więc nie ma ryzyka naruszenia.
- **Ryzyko:** Minimalne. Constraint `DROP` jest chwilowy (w jednej transakcji DDL).
- **Weryfikacja zaliczona:** Constraint o tej nazwie istnieje z dokładnie tymi wartościami.

### ✅ 20260320123006 — create_group_booking_atomic
- **Operacja:** `CREATE OR REPLACE FUNCTION create_group_booking_atomic(...)`
- **Dane:** Brak zmian w danych. Nowa funkcja.
- **Ryzyko:** Zerowe.

### ✅ 20260404000001 — service_addons
- **Operacja:** `CREATE TABLE service_addons`, `CREATE TABLE booking_addons` + RLS
- **Dane:** Tabele nie istnieją na PROD — tworzy nowe, puste tabele.
- **Ryzyko:** Zerowe. Addytywne.
- **Uwaga:** Brak `IF NOT EXISTS` w SQL, ale tabele potwierdzone jako nieistniejące.

### ✅ 20260408000000 — replace_equipment_services_atomic
- **Operacja:** `CREATE OR REPLACE FUNCTION replace_equipment_services(...)` + `GRANT EXECUTE`
- **Dane:** Brak zmian. Nowa/zastępująca funkcja.
- **Ryzyko:** Zerowe.

### ✅ 20260409100000 — fix_create_booking_atomic_overlap
- **Operacja:** `CREATE OR REPLACE FUNCTION create_booking_atomic(...)` — naprawa logiki wykrywania nakładań
- **Dane:** Brak zmian w danych. Zastępuje istniejącą funkcję.
- **Ryzyko:** Zerowe dla danych. Efekt: od tego momentu próba utworzenia nakładającej się wizyty przez API będzie odrzucona (poprawnie). Istniejące wizyty bez zmian.

---

## PROCEDURA KROK PO KROKU

### Krok 1 — Połącz CLI z PROD

```bash
supabase link --project-ref ubkueiwelarplnbhqmoa -p eeY8BBUvdDibD9gK
```

> ⚠️ Uwaga: `supabase migration list` nie działa przez pooler (błąd auth mimo poprawnego hasła).
> Stan migracji był sprawdzony przez Management API. Push działa przez inny mechanizm — sprawdź Krok 2.

### Krok 2 — Sprawdź czy push w ogóle działa

```bash
supabase db push --include-all --dry-run 2>&1
```

Jeśli `--dry-run` nie istnieje w tej wersji CLI lub zwróci błąd auth — użyj Krok 2b.

**Krok 2b — Push przez Management API (fallback)**

Jeśli CLI nie może się połączyć z PROD przez pooler, wykonaj każdą z 7 migracji ręcznie przez:
- Supabase Dashboard → PROD projekt (`ubkueiwelarplnbhqmoa`) → SQL Editor
- Wklej zawartość każdego pliku po kolei

Kolejność plików do wykonania w SQL Editor:
```
supabase/migrations/20260318120000_fix_audit_trigger_deleted_at.sql
supabase/migrations/20260318130000_vouchers.sql
supabase/migrations/20260319144000_add_voucher_payment_method.sql
supabase/migrations/20260320123006_create_group_booking_atomic.sql
supabase/migrations/20260404000001_service_addons.sql
supabase/migrations/20260408000000_replace_equipment_services_atomic.sql
supabase/migrations/20260409100000_fix_create_booking_atomic_overlap.sql
```

Po każdym pliku sprawdź że nie ma błędu przed przejściem do następnego.

### Krok 3 — Napraw historię migracji w CLI

Po ręcznym wykonaniu SQL Editor, CLI nie będzie wiedział że migracje są zastosowane. Napraw historię przez SQL Editor:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20260318120000', 'fix_audit_trigger_deleted_at', ARRAY[]::text[]),
  ('20260318130000', 'vouchers', ARRAY[]::text[]),
  ('20260319144000', 'add_voucher_payment_method', ARRAY[]::text[]),
  ('20260320123006', 'create_group_booking_atomic', ARRAY[]::text[]),
  ('20260404000001', 'service_addons', ARRAY[]::text[]),
  ('20260408000000', 'replace_equipment_services_atomic', ARRAY[]::text[]),
  ('20260409100000', 'fix_create_booking_atomic_overlap', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
```

### Krok 4 — Zregeneruj typy TypeScript ze staging (nie PROD)

Po zakończeniu migracji na PROD wróć CLI na staging i zregeneruj typy:

```bash
# Wróć na staging
supabase link --project-ref bxkxvrhspklpkkgmzcge -p <hasło_staging>

# Typy już są aktualne (zrobione dziś) — można pominąć
# Ale dla pewności:
supabase gen types typescript --linked > types/supabase.ts
# Usuń ewentualny śmieć CLI z końca pliku
npx tsc --noEmit
```

### Krok 5 — Weryfikacja po migracji

Sprawdź w SQL Editor na PROD że tabele istnieją:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vouchers', 'voucher_transactions', 'service_addons', 'booking_addons')
ORDER BY table_name;
-- Oczekiwany wynik: 4 wiersze
```

Sprawdź funkcje:
```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_group_booking_atomic', 'create_booking_atomic', 'replace_equipment_services')
ORDER BY routine_name;
-- Oczekiwany wynik: 3 wiersze
```

---

## ROLLBACK (gdyby coś poszło nie tak)

Wszystkie 7 migracji są **w pełni odwracalne** bez utraty istniejących danych:

```sql
-- Nowe tabele (są puste — tworzone dziś)
DROP TABLE IF EXISTS booking_addons CASCADE;
DROP TABLE IF EXISTS service_addons CASCADE;
DROP TABLE IF EXISTS voucher_transactions CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;

-- Constraint — przywróć bez 'voucher'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK ((payment_method = ANY (ARRAY['cash','card','transfer','other'])) OR (payment_method IS NULL));

-- Funkcje — przywróć poprzednie wersje z git (git show HEAD~N:supabase/migrations/...)
```

---

## PODSUMOWANIE

- **7 migracji** do wgrania
- **0 migracji** wymagających `repair` (żadna z tabel nie istnieje na PROD przed migracją)
- **0 modyfikacji istniejących danych** — wszystkie migracje są addytywne lub zastępują funkcje SQL
- **Jedyne ryzyko operacyjne:** jeśli CLI nie może się połączyć z PROD przez pooler (znany problem z hasłem) → ścieżka SQL Editor działa niezależnie
- **Czas wykonania:** ~5 minut przez SQL Editor, ~2 minuty przez CLI (jeśli zadziała)
