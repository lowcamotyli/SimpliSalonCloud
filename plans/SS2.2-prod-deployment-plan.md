# SS2.2 — Plan wdrożenia na PROD (release/SS2.2)

Checklist operacyjny dla wdrożenia `release/SS2.2` na produkcję.

## Kontekst
- [ ] PROD Supabase: `ubkueiwelarplnbhqmoa` (`SimpliSalonCloud`) — org `vpfeawiuqvocotnjxvii`
- [ ] Staging Supabase: `bxkxvrhspklpkkgmzcge` (`SimpliSalonCloud_Staging`) — aktualnie podlinkowany
- [ ] PROD code działa z brancha `main` na Vercel
- [ ] `release/SS2.2` zawiera: sprint-00 do sprint-12 + sprint-25 (public API key security)
- [ ] `tsc` jest CLEAN na `release/SS2.2`
- [ ] Staging DB ma zastosowane wszystkie migracje SS2.2
- [ ] PROD DB: stan nieznany (wymagana weryfikacja `supabase migration list`)

---

## Checkpoint 0 — Przygotowanie SS2.2 (commit pending files)

### 0.1 Aktualizacja brancha i kontrola stanu
- [ ] Przejdź na branch release i pobierz najnowsze zmiany:
```bash
git checkout release/SS2.2
git pull origin release/SS2.2
```
- [ ] Sprawdź aktualny status:
```bash
git status
```

### 0.2 Dodanie plików DO COMMIT
- [ ] Dodaj tracked modified:
```bash
git add AGENTS.md CLAUDE.md package.json playwright.config.ts .gitignore scripts/gen_field_map.ps1 sprints/SS2.2/README.md docs/sprints/SS2.0/*.md
```
- [ ] Dodaj untracked migrations:
```bash
git add supabase/migrations/20260401141104_fix_rls_missing_tables.sql
git add supabase/migrations/20260407100000_fix_client_code_race_condition.sql
```
- [ ] Dodaj untracked plans/scripts:
```bash
git add plans/SS2.2-wymagania-z-transkrypcji-2026-04-03.md scripts/playwright.cmd
```

### 0.3 Wykluczenia (NIE COMMITOWAĆ)
- [ ] Potwierdź, że poniższe nie są staged:
```text
.claude/settings.local.json
.env.vercel.*
.playwright/
output/
SimpliSalon ulepszenia 01.04.*
tsc-public-bookings.txt
sprints/SS2.3/
```
- [ ] Jeśli coś z powyższych trafiło do staged, usuń ze staging area:
```bash
git restore --staged <ścieżka>
```

### 0.4 Commit i push SS2.2
- [ ] Finalna kontrola staged:
```bash
git status
```
- [ ] Commit:
```bash
git commit -m "chore: finalize SS2.2 release package and pending migrations"
```
- [ ] Push:
```bash
git push origin release/SS2.2
```

---

## Checkpoint 1 — Migracje na PROD DB

### 1.1 Link do PROD
- [ ] Przełącz link Supabase na PROD:
```bash
supabase link --project-ref ubkueiwelarplnbhqmoa
```
- [ ] Podaj hasło DB interaktywnie (prompt CLI).

### 1.2 Audyt migracji PROD
- [ ] Sprawdź listę migracji lokalnych i zdalnych:
```bash
supabase migration list
```
- [ ] Potwierdź brakujące na PROD migracje (minimum poniższe):
```text
20260313120000_treatment_protocols.sql
20260313130000_rename_plan_types.sql
20260318120000_fix_audit_trigger_deleted_at.sql
20260318130000_vouchers.sql
20260318140000_visit_groups.sql
20260319144000_add_voucher_payment_method.sql
20260320123006_create_group_booking_atomic.sql
20260323173000_allow_visit_group_no_show.sql
20260325000003_booking_payments.sql
20260401000001_form_data_category.sql
20260401000002_restrict_client_forms_select.sql
20260401000003_health_consent_at.sql
20260401141104_fix_rls_missing_tables.sql
20260402000001_treatment_records.sql
20260402000002_treatment_plans.sql
20260402000003_treatment_photos.sql
20260402000004_treatment_photos_storage.sql
20260403000001_health_data_access_logs.sql
20260403120000_add_paid_booking_status.sql
20260404000001_service_addons.sql
20260407100000_fix_client_code_race_condition.sql
20260408000000_replace_equipment_services_atomic.sql
20260409100000_fix_create_booking_atomic_overlap.sql
20260410100000_employee_services.sql
20260415100000_gmail_send_integration.sql
20260416100000_employee_shifts_system.sql
20260416200000_shift_rules.sql
20260420000001_salon_api_keys.sql
```

### 1.3 Wdrożenie migracji
- [ ] Zastosuj wszystkie brakujące migracje:
```bash
supabase db push --include-all
```

### 1.4 Weryfikacja po pushu
- [ ] Ponownie sprawdź stan migracji:
```bash
supabase migration list
```
- [ ] Potwierdź: `Local == Remote` dla wszystkich pozycji.

### 1.5 Przywrócenie linku na staging
- [ ] Przełącz link z powrotem na staging:
```bash
supabase link --project-ref bxkxvrhspklpkkgmzcge
```

---

## Checkpoint 2 — Merge SS2.2 -> main

### 2.1 Aktualizacja main
- [ ] Przełącz branch i pobierz najnowszy main:
```bash
git checkout main
git pull origin main
```

### 2.2 Merge release
- [ ] Wykonaj merge bez fast-forward:
```bash
git merge release/SS2.2 --no-ff -m "feat: release SS2.2 sprint-00..12 + sprint-25"
```

### 2.3 Push na origin/main
- [ ] Wypchnij merge commit:
```bash
git push origin main
```

### 2.4 Weryfikacja Vercel
- [ ] Potwierdź, że deployment na Vercel uruchomił się automatycznie dla `main`.
- [ ] Potwierdź status deploymentu: `Ready` (bez runtime/build errors).

---

## Checkpoint 3 — Weryfikacja post-deploy (smoke tests)

- [ ] `POST /api/clients` — test duplikacji kodu klienta (fix race condition) i brak `duplicate key`.
- [ ] `GET /api/public/bookings` — poprawna autoryzacja przez API key.
- [ ] Employee services assignment — przypisanie usług pracownikom działa end-to-end.
- [ ] Przelewy24 checkout flow — utworzenie i finalizacja płatności bez błędów.
- [ ] Gmail outbound — wysyłka wiadomości działa na produkcji.
- [ ] Employee shifts — tworzenie/edycja/odczyt grafików działa.
- [ ] Payroll reports — generowanie raportów płacowych działa.
- [ ] Treatment plans — CRUD i powiązane odczyty działają poprawnie.

---

## Rollback plan

| Scenariusz | Akcja |
|---|---|
| Błąd build/runtime po merge na `main` | `git checkout main && git pull origin main && git revert -m 1 <MERGE_COMMIT_SHA> && git push origin main` |
| Vercel deploy `Failed` i brak szybkiego fixa | Revert merge commit jak wyżej, potwierdzić nowy deployment po rewercie |
| Krytyczny bug funkcjonalny po wdrożeniu | Natychmiastowy revert merge commit + hotfix na `release/SS2.2` i ponowny kontrolowany merge |
| Problem po migracjach DB (logika/aplikacja) | Wstrzymać dalsze deploye, przygotować migrację naprawczą forward-only, wdrożyć przez `supabase db push --include-all` |
| Niezgodność historii migracji (`migration list`) | Zweryfikować drift, użyć punktowej naprawy `supabase migration repair <version> --status applied --linked --yes`, ponowić `supabase db push --include-all` |

---

## Stan po wdrożeniu

- [ ] Checkpoint 0 zakończony
- [ ] Checkpoint 1 zakończony
- [ ] Checkpoint 2 zakończony
- [ ] Checkpoint 3 zakończony
- [ ] Rollback nie był potrzebny
- [ ] Deployment PROD SS2.2 zakończony sukcesem
