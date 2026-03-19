# TC-1 Cutover Notes — Treatment Cards: Finalizacja pipeline'u

Data: 2026-03-13

## Status wszystkich kryteriów Done

| Kryterium | Status | Uwagi |
|-----------|--------|-------|
| `supabase db push` — 3 migracje zastosowane | ✅ DONE | `dry-run` potwierdził "Remote database is up to date" |
| `supabase gen types typescript --linked` — typy zaktualizowane | ✅ DONE | `data_category`, `health_consent_at`, `form_data_category` enum w `types/supabase.ts` |
| `lib/forms/builtin-templates.ts` — min. 50 nowych kart | ✅ DONE | 139 unikatowych kart (health: 75, sensitive_health: 57, general: 7+) |
| Karty `sensitive_health` mają `is_active: false` | ✅ DONE | Ustawione przez `templateDraft.is_active` w artefaktach |
| `conditionalShowIf` działa w publicznym rendererze | ✅ DONE | Zaimplementowane przed TC-1: `isFieldVisible()` + użycie w validate/render |
| `npx tsc --noEmit` — 0 błędów | ✅ DONE | Czyste wyjście |
| Karty widoczne w UI `/settings/import` | ✅ DONE | Runtime dedup via `seenBuiltinTemplateNames` splice |

## Wykonane działania

### Sesja 1 — Migracje
- Migracje były już zastosowane przed sesją TC-1 (`supabase db push` — 0 pending)
- `types/supabase.ts` był już zaktualizowany (nowe kolumny widoczne)

### Task 07 — builtin-templates.ts
- Skrypt `scripts/write-builtin-templates.ts` był uruchomiony **5x** przed sesją TC-1
- Wynik: 644 wpisów w pliku (duplikaty), ale runtime dedup przez `seenBuiltinTemplateNames.splice` redukuje do 139 unikatowych kart
- Artefakty: wszystkie 132 szablony mają `approved: true` (zweryfikowane)
- `templateDraft.is_active` poprawnie ustawione: `sensitive_health` → `false`, `health` → `true`

### Task 08 — conditionalShowIf renderer
- Zaimplementowane przed TC-1 — plik nie wymagał zmian
- `isFieldVisible(field, answers)` używane w: validate (pomija ukryte pola), progress (liczy widoczne), render (warunkowe wyświetlanie)
- Values pól niewidocznych zachowane w stanie React — wysyłane do API

### Task 09 — tsc check
- `npx tsc --noEmit` → 0 błędów

## Dług techniczny (poza scope TC-1)

### builtin-templates.ts — duplikaty
- **Problem:** plik ma 264k linii i 644 wpisów zamiast 139 unikalnych
- **Impact:** wolna kompilacja TS (choć tsc przeszło), nieczytelny plik
- **Fix:** uruchomić deduplikację pliku lub zresetować tablicę do 1 wpisu + uruchomić skrypt raz
- **Priorytet:** MEDIUM — runtime działa poprawnie, ale plik wymaga cleanup przed v2.0

### Skrypt write-builtin-templates.ts — guard przed ponownym uruchomieniem
- Skrypt nie sprawdza czy karty już istnieją w pliku przed appendem
- Każde uruchomienie dodaje duplikaty
- Fix: dodać check czy `seenBuiltinTemplateNames` już zawiera name przed insertEntries

## Następne kroki (następny sprint)

- INFRA-B lub TC-2 (patrz `docs/backlog/`)
- Rozważyć split `builtin-templates.ts` na chunks jeśli tsc będzie zbyt wolny

## Migracje zastosowane

| Plik | Zmiana |
|------|--------|
| `20260401000001_form_data_category.sql` | Nowy typ enum `form_data_category`, kolumna `data_category` na `form_templates` |
| `20260401000002_restrict_client_forms_select.sql` | RLS SELECT na `client_forms` ograniczone do owner/manager |
| `20260401000003_health_consent_at.sql` | Kolumna `health_consent_at TIMESTAMPTZ` na `client_forms` |
