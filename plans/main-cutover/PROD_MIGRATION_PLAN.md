# Plan wgrania migracji na PROD

**Data przygotowania:** 2026-03-23
**Status:** GOTOWY DO WYKONANIA - stan PROD zweryfikowany
**PROD project:** `ubkueiwelarplnbhqmoa`
**Staging project:** `bxkxvrhspklpkkgmzcge` (CLI linked - przywrocony po analizie)

---

## STAN FAKTYCZNY PROD (zweryfikowany 2026-03-23)

### Migracje brakujace na PROD - dokladnie 8:

| # | Migracja | Co robi |
|---|----------|---------|
| 1 | `20260318120000_fix_audit_trigger_deleted_at` | Naprawa funkcji `audit_trigger_func()` - bug fix |
| 2 | `20260318130000_vouchers` | Nowe tabele: `vouchers`, `voucher_transactions` |
| 3 | `20260319144000_add_voucher_payment_method` | Dodaje `voucher` do CHECK constraint na `bookings.payment_method` |
| 4 | `20260320123006_create_group_booking_atomic` | Nowa funkcja SQL dla multi-bookingow |
| 5 | `20260323173000_allow_visit_group_no_show` | Rozszerza `visit_groups.status` o `no_show` dla grouped bookings |
| 6 | `20260404000001_service_addons` | Nowe tabele: `service_addons`, `booking_addons` |
| 7 | `20260408000000_replace_equipment_services_atomic` | Nowa funkcja SQL dla equipment-services |
| 8 | `20260409100000_fix_create_booking_atomic_overlap` | Naprawa `create_booking_atomic` - fix wykrywania nakladajacych sie wizyt |

### Weryfikacje wykonane - wyniki:

| Sprawdzenie | Wynik | Wplyw na plan |
|-------------|-------|---------------|
| Plany w `subscriptions` | tylko `enterprise` (1 wiersz) | `rename_plan_types` juz na PROD |
| Plany w `salons` | `solo` (14) + `enterprise` (6) | `rename_plan_types` juz na PROD |
| Tabela `vouchers` istnieje? | **NIE** | Migracja wykona sie normalnie, bez `repair` |
| Tabela `service_addons` istnieje? | **NIE** | Migracja wykona sie normalnie, bez `repair` |
| Constraint `bookings_payment_method_check` | Istnieje, wartosci: `cash, card, transfer, other` | Nazwa i wartosci sie zgadzaja |

### Dodatkowa uwaga do grouped no-show

- Migracja `20260323173000_allow_visit_group_no_show.sql` powinna byc wgrana na staging przed testami grouped `no_show`.
- Te sama migracje trzeba uwzglednic na PROD, bo bez niej endpoint grupowy moze wpasc w blad constraint `visit_groups.status`.

---

## ANALIZA RYZYKA - KAZDA MIGRACJA

### 20260318120000 - fix_audit_trigger_deleted_at
- **Operacja:** `CREATE OR REPLACE FUNCTION audit_trigger_func()`
- **Dane:** Brak zmian w danych. Tylko zastapienie funkcji SQL.
- **Ryzyko:** Zerowe. Idempotentna.

### 20260318130000 - vouchers
- **Operacja:** `CREATE TABLE vouchers`, `CREATE TABLE voucher_transactions` + RLS
- **Dane:** Tabele nie istnialy na PROD - tworzy nowe, puste tabele.
- **Ryzyko:** Zerowe. Addytywne.
- **Uwaga:** Brak `IF NOT EXISTS` w SQL, ale tabele potwierdzone jako nieistniejace.

### 20260319144000 - add_voucher_payment_method
- **Operacja:** `DROP CONSTRAINT bookings_payment_method_check` + `ADD CONSTRAINT` z `voucher`
- **Dane:** Modyfikuje constraint, nie dane. Zaden istniejacy booking nie ma `payment_method = 'voucher'`, wiec nie ma ryzyka naruszenia.
- **Ryzyko:** Minimalne. Constraint `DROP` jest chwilowy (w jednej transakcji DDL).
- **Weryfikacja zaliczona:** Constraint o tej nazwie istnieje z dokladnie tymi wartosciami.

### 20260320123006 - create_group_booking_atomic
- **Operacja:** `CREATE OR REPLACE FUNCTION create_group_booking_atomic(...)`
- **Dane:** Brak zmian w danych. Nowa funkcja.
- **Ryzyko:** Zerowe.

### 20260323173000 - allow_visit_group_no_show
- **Operacja:** Zmiana CHECK constraint na `visit_groups.status`.
- **Dane:** Brak modyfikacji danych. Rozszerzenie dozwolonych wartosci o `no_show`.
- **Ryzyko:** Niskie. Schema-only, wymagane do grouped no-show.

### 20260404000001 - service_addons
- **Operacja:** `CREATE TABLE service_addons`, `CREATE TABLE booking_addons` + RLS
- **Dane:** Tabele nie istnialy na PROD - tworzy nowe, puste tabele.
- **Ryzyko:** Zerowe. Addytywne.
- **Uwaga:** Brak `IF NOT EXISTS` w SQL, ale tabele potwierdzone jako nieistniejace.

### 20260408000000 - replace_equipment_services_atomic
- **Operacja:** `CREATE OR REPLACE FUNCTION replace_equipment_services(...)` + `GRANT EXECUTE`
- **Dane:** Brak zmian. Nowa/zastepujaca funkcja.
- **Ryzyko:** Zerowe.

### 20260409100000 - fix_create_booking_atomic_overlap
- **Operacja:** `CREATE OR REPLACE FUNCTION create_booking_atomic(...)` - naprawa logiki wykrywania nakladan
- **Dane:** Brak zmian w danych. Zastepuje istniejaca funkcje.
- **Ryzyko:** Zerowe dla danych. Efekt: od tego momentu proba utworzenia nakladajacej sie wizyty przez API bedzie odrzucona poprawnie. Istniejace wizyty bez zmian.

---

## PROCEDURA KROK PO KROKU

### Krok 1 - Polacz CLI z PROD

```bash
supabase link --project-ref ubkueiwelarplnbhqmoa -p eeY8BBUvdDibD9gK
```

> Uwaga: `supabase migration list` nie dziala przez pooler. Stan migracji byl sprawdzony przez Management API.

### Krok 2 - Sprawdz czy push w ogole dziala

```bash
supabase db push --include-all --dry-run 2>&1
```

Jesli `--dry-run` nie istnieje w tej wersji CLI lub zwroci blad auth - uzyj Krok 2b.

**Krok 2b - Push przez SQL Editor (fallback)**

Jesli CLI nie moze sie polaczyc z PROD przez pooler, wykonaj kazda z 8 migracji recznie przez:
- Supabase Dashboard -> PROD projekt (`ubkueiwelarplnbhqmoa`) -> SQL Editor
- Wklej zawartosc kazdego pliku po kolei

Kolejnosc plikow do wykonania w SQL Editor:
```
supabase/migrations/20260318120000_fix_audit_trigger_deleted_at.sql
supabase/migrations/20260318130000_vouchers.sql
supabase/migrations/20260319144000_add_voucher_payment_method.sql
supabase/migrations/20260320123006_create_group_booking_atomic.sql
supabase/migrations/20260323173000_allow_visit_group_no_show.sql
supabase/migrations/20260404000001_service_addons.sql
supabase/migrations/20260408000000_replace_equipment_services_atomic.sql
supabase/migrations/20260409100000_fix_create_booking_atomic_overlap.sql
```

Po kazdym pliku sprawdz, ze nie ma bledu przed przejsciem do nastepnego.

### Krok 3 - Napraw historie migracji w CLI

Po recznym wykonaniu SQL Editor, CLI nie bedzie wiedzialo ze migracje sa zastosowane. Napraw historie przez SQL Editor:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20260318120000', 'fix_audit_trigger_deleted_at', ARRAY[]::text[]),
  ('20260318130000', 'vouchers', ARRAY[]::text[]),
  ('20260319144000', 'add_voucher_payment_method', ARRAY[]::text[]),
  ('20260320123006', 'create_group_booking_atomic', ARRAY[]::text[]),
  ('20260323173000', 'allow_visit_group_no_show', ARRAY[]::text[]),
  ('20260404000001', 'service_addons', ARRAY[]::text[]),
  ('20260408000000', 'replace_equipment_services_atomic', ARRAY[]::text[]),
  ('20260409100000', 'fix_create_booking_atomic_overlap', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;
```

### Krok 4 - Zregeneruj typy TypeScript ze staging (nie PROD)

Po zakonczeniu migracji na PROD wroc CLI na staging i zregeneruj typy:

```bash
# Wroc na staging
supabase link --project-ref bxkxvrhspklpkkgmzcge -p <haslo_staging>

# Typy juz sa aktualne, ale dla pewnosci:
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
```

### Krok 5 - Weryfikacja po migracji

Sprawdz w SQL Editor na PROD ze tabele istnieja:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vouchers', 'voucher_transactions', 'service_addons', 'booking_addons')
ORDER BY table_name;
-- Oczekiwany wynik: 4 wiersze
```

Sprawdz funkcje:
```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('create_group_booking_atomic', 'create_booking_atomic', 'replace_equipment_services')
ORDER BY routine_name;
-- Oczekiwany wynik: 3 wiersze
```

---

## ROLLBACK (gdyby cos poszlo nie tak)

Wszystkie 8 migracji sa **w pelni odwracalne** bez utraty istniejacych danych:

```sql
-- Nowe tabele (sa puste - tworzone dzis)
DROP TABLE IF EXISTS booking_addons CASCADE;
DROP TABLE IF EXISTS service_addons CASCADE;
DROP TABLE IF EXISTS voucher_transactions CASCADE;
DROP TABLE IF EXISTS vouchers CASCADE;

-- Constraint - przywrocic bez 'voucher'
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK ((payment_method = ANY (ARRAY['cash','card','transfer','other'])) OR (payment_method IS NULL));

-- Constraint visit_groups.status - przywrocic bez 'no_show'
ALTER TABLE visit_groups DROP CONSTRAINT IF EXISTS visit_groups_status_check;
ALTER TABLE visit_groups ADD CONSTRAINT visit_groups_status_check
  CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled'));

-- Funkcje - przywrocic poprzednie wersje z git (git show HEAD~N:supabase/migrations/...)
```

---

## PODSUMOWANIE

- **8 migracji** do wgrania
- **0 migracji** wymagajacych `repair` (zadna z tabel nie istnieje na PROD przed migracja)
- **0 modyfikacji istniejacych danych** - wszystkie migracje sa addytywne lub zastepuja funkcje SQL
- **Jedyne ryzyko operacyjne:** jesli CLI nie moze sie polaczyc z PROD przez pooler -> sciezka SQL Editor dziala niezaleznie
- **Czas wykonania:** ~5 minut przez SQL Editor, ~2 minuty przez CLI (jesli zadziala)
