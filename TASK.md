# TASK — Code Review Fixes (CRM Revamp Sprints) — 2026-03-05

## Objective
Kontynuacja napraw z code review sprintów CRM Revamp (00-08).
Krytyczne (5/5) naprawione. Pozostały: 7 poważnych + 5 średnich + 3 niskie.

## Status

### [x] DONE — Krytyczne (naprawione w poprzedniej sesji)
- [x] Fix #1: XSS w `app/api/bookings/confirm/[token]/route.ts` — escapeHtml()
- [x] Fix #2: Blacklist `warned → blacklisted` bug — `.in(['clean','warned'])` w CRON
- [x] Fix #3: Late cancel threshold — tworzenie violations w booking PATCH + scoring w CRON
- [x] Fix #4: Survey CRON kolejnosc INSERT→SMS→UPDATE (idempotent przez UNIQUE)
- [x] Fix #5: SMS webhook multi-tenant — limit(2) + warn log zamiast silent fail

---

## [ ] NEXT — Poważne (priorytet)

### Fix #6: RLS — `client_forms_write` brak ograniczenia roli
**Plik:** `supabase/migrations/` (nowa migracja)
**Problem:** Każdy `employee` może UPDATE/DELETE dane medyczne klientów bezpośrednio przez Supabase API.
**Fix:** Nowa migracja SQL:
```sql
DROP POLICY IF EXISTS "client_forms_write" ON public.client_forms;
CREATE POLICY "client_forms_write" ON public.client_forms
    FOR ALL USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );
```

### Fix #7: NPS report — null nps_score liczony jako 0 (detractor)
**Plik:** `app/api/reports/nps/route.ts:89-95`
**Problem:** Klient który wypelnil tylko `rating` (bez NPS) jest liczony jako detractor z wynikiem 0.
**Fix:** Pominac `survey.nps_score === null` w NPS calculation. Tylko survey z non-null nps_score powinno wchodzic do NPS stats.

### Fix #8: Podpisy medyczne w public Supabase Storage
**Plik:** `app/api/forms/submit/[token]/route.ts:103-113`
**Problem:** `getPublicUrl()` — podpisy RODO dostepne bez auth dla każdego z URL.
**Fix:**
1. Zmienić bucket `signatures` na private w Supabase Dashboard (lub przez API)
2. Zastapic `getPublicUrl()` przez `createSignedUrl(path, 3600)` (1h expiry)
3. Przy odczycie podpisu przez admin — generowac signed URL on-demand
**Uwaga:** Wymaga migracji istniejacych URL w bazie (lub lazy migration przy odczycie)

### Fix #9: Token typ collision — survey vs booking-confirm
**Pliki:** `lib/messaging/survey-token.ts`, `lib/messaging/booking-confirm-token.ts`
**Problem:** Ten sam JWT_SECRET i algorytm, brak `typ` claimu. Token z jednego endpointu przyjmowany przez drugi.
**Fix:** Dodac `typ` claim w `generateSurveyToken` i `generateBookingConfirmToken`,
weryfikowac go przy `verifyXxxToken`.
```typescript
// w generateSurveyToken:
new SignJWT({ ...payload, typ: 'survey' })
// w verifySurveyToken:
if (payload.typ !== 'survey') throw new Error('Invalid token type')
```

### Fix #10: RLS — `beauty_plans_all` brak ograniczenia roli
**Plik:** `supabase/migrations/` (nowa migracja, najlepiej razem z Fix #6)
**Problem:** Employee może DELETE plany zabiegowe.
**Fix:**
```sql
DROP POLICY IF EXISTS "beauty_plans_all" ON public.beauty_plans;
CREATE POLICY "beauty_plans_select" ON public.beauty_plans
    FOR SELECT USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
    );
CREATE POLICY "beauty_plans_write" ON public.beauty_plans
    FOR ALL USING (
        client_id IN (SELECT c.id FROM public.clients c WHERE c.salon_id = public.get_user_salon_id())
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );
-- analogicznie beauty_plan_steps_all
DROP POLICY IF EXISTS "beauty_plan_steps_all" ON public.beauty_plan_steps;
CREATE POLICY "beauty_plan_steps_select" ON public.beauty_plan_steps
    FOR SELECT USING (
        plan_id IN (SELECT bp.id FROM public.beauty_plans bp
            JOIN public.clients c ON c.id = bp.client_id
            WHERE c.salon_id = public.get_user_salon_id())
    );
CREATE POLICY "beauty_plan_steps_write" ON public.beauty_plan_steps
    FOR ALL USING (
        plan_id IN (SELECT bp.id FROM public.beauty_plans bp
            JOIN public.clients c ON c.id = bp.client_id
            WHERE c.salon_id = public.get_user_salon_id())
        AND public.has_any_salon_role(ARRAY['owner', 'manager'])
    );
```

### Fix #11: Brak manual violation POST endpoint
**Plik:** `app/api/clients/[id]/violations/route.ts` (tylko GET)
**Problem:** Nie ma możliwości ręcznego dodania violation przez UI (np. manualne oznaczenie no-show poza flow bookingu).
**Fix:** Dodac POST handler do violations route — autentykacja owner/manager, walidacja violation_type.

### Fix #12: FORMS_ENCRYPTION_KEY — fallback SHA256 slabego klucza
**Plik:** `lib/forms/encryption.ts:30-31`
**Problem:** Słaby klucz np. "password" jest akceptowany bez ostrzeżenia.
**Fix:** Usunac fallback `createHash('sha256').update(trimmed).digest()` — zamiast tego rzucac błąd:
```typescript
throw new Error('FORMS_ENCRYPTION_KEY must be 64-char hex, 32-byte base64, or 32-byte UTF-8 string')
```

---

## [ ] TODO — Srednie

### Fix #13: Reminders CRON — mało precyzyjny date filter przy granicy doby
**Plik:** `app/api/cron/reminders/route.ts:74-81`
**Problem:** Dla rules z `hours_before=1` i granicy dnia — `booking_date` filter może zwracac fałszywe trafienia.
**Fix:** Zmienić date filter na exact datetime comparison (filtruj .gte/.lte po datetime, nie po dacie).

### Fix #14: Surveys migration — brak schematu `public.`
**Plik:** `supabase/migrations/20260331_surveys_reports.sql`
**Problem:** Brak prefiksu `public.` na wszystkich tabelach — niespójność z reszta migracji.
**Fix:** Poprawic nazwy tabel w migracji (ALTER TABLE public.bookings, CREATE TABLE public.satisfaction_surveys itd.)
**Uwaga:** Jesli migracja juz zostala zastosowana, potrzebna nowa migracja naprawcza (nie edycja istniejacej).

### Fix #15: `decrement_sms_balance` — race condition
**Plik:** `lib/messaging/sms-sender.ts:101-136`
**Problem:** Dwa równoległe requesty mogą obaj przejsc sprawdzenie salda i obaj wyslac SMS.
**Fix:** Usunac wstepne sprawdzenie salda — polegac tylko na `decrement_sms_balance` RPC (atomowe UPDATE z CHECK).
Wywolac RPC PRZED wyslaniem SMS. Rollback: jesli RPC zwróci false — nie wysylaj.

### Fix #16: Top-services — duże `bookingIds` IN array
**Plik:** `app/api/reports/top-services/route.ts:104-113`
**Problem:** Przy >1000 bookingów, `.in('booking_id', bookingIds)` nieefetkywne.
**Fix:** JOIN satisfaction_surveys w pierwszym query lub limit zakresu dat.

### Fix #17: `forms/public/[token]` — 4 sekwencyjne queries
**Plik:** `app/api/forms/public/[token]/route.ts`
**Fix:** Po pierwszym query (clientForm) zrównoleglic pozostale 3 przez `Promise.all`.

---

## [ ] TODO — Niskie

### Fix #18: Booking confirm — brak guard na aktualny status
**Plik:** `app/api/bookings/confirm/[token]/route.ts`
**Problem:** Klient moze kliknac stary link confirm i zmienic status anulowanej wizyty z powrotem na confirmed.
**Fix:** Dodac `.in('status', ['pending', 'scheduled'])` do UPDATE query przy akcji `confirm`.

### Fix #19: `check_equipment_availability` — duplikacja subquery
**Plik:** `supabase/migrations/20260305100002_equipment_v3.sql`
**Fix:** Przepisac funkcje z CTE lub lateral join zeby eliminowac podwójne przeszukiwanie equipment_bookings.

---

## Key decisions / constraints
- SQL migracje: stosowac przez Supabase Management API (curl) lub `supabase db push`
- Po każdej migracji: `supabase gen types typescript --linked > types/supabase.ts`
- Fix #6 i #10 mozna polaczyc w jednej migracji: `20260305200000_fix_forms_plans_rls.sql`
- Fix #8 (public storage) wymaga decyzji: signed URL expiry time (1h? 24h? 7d?)

## Context files to read
- `supabase/migrations/20260310000000_medical_forms.sql` — RLS do poprawki (#6, #10)
- `app/api/reports/nps/route.ts` — NPS null fix (#7)
- `app/api/forms/submit/[token]/route.ts` — signatures storage (#8)
- `lib/messaging/survey-token.ts`, `lib/messaging/booking-confirm-token.ts` — token typ (#9)
- `lib/forms/encryption.ts` — key validation (#12)
- `lib/messaging/sms-sender.ts` — race condition (#15)

## Resume command
codex exec --dangerously-bypass-approvals-and-sandbox 'Read TASK.md for context. Do NOT use Gemini -- write directly.
Start with Fix #6 and #10: create SQL migration supabase/migrations/20260305200000_fix_forms_plans_rls.sql
with DROP POLICY + CREATE POLICY for client_forms_write, beauty_plans_all, beauty_plan_steps_all.
Add role restriction using public.has_any_salon_role(ARRAY[''owner'',''manager'']).
Write directly.'
