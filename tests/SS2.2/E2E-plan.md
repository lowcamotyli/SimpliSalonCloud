# E2E Test Plan — SS2.2

## Strategia testowania

### Lokalnie (`next dev` + staging Supabase)
Wszystko co nie wymaga publicznego URL-a — szybkie iteracje, brak czekania na Vercel.

### Tylko Vercel Preview (wymaga publicznego URL)
- **Gmail OAuth** — redirect URI musi być zarejestrowany w Google Console
- **Przelewy24 webhook** — `/api/payments/booking/[id]/status` musi być publiczny

**Flow:** Lokalnie → napraw wszystko → Preview tylko dla Gmail + P24 webhook.

---

## Warunki wstępne

```bash
# 1. Migracje na staging
supabase db push

# 2. Typy aktualne
# UWAGA: przekieruj stderr żeby uniknąć wpadnięcia komunikatu upgrade CLI do pliku
supabase gen types typescript --linked 2>/dev/null > types/supabase.ts

# 3. Zero błędów TypeScript
npx tsc --noEmit

# 4. Serwer lokalny
pnpm dev
```

Migracje do wdrożenia:
- `20260325000003_booking_payments.sql`
- `20260410100000_employee_services.sql`
- `20260415100000_gmail_send_integration.sql`
- `20260416100000_employee_shifts_system.sql`
- `20260416200000_shift_rules.sql`

**Feature flags (staging):** `treatment_records: true` — włączone ręcznie przez skrypt `tests/SS2.2/enable-feature.mjs`

---

## Moduł 1 — Employee-service assignment (sprint-01/02)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 1.1 | Pracownicy → otwórz profil pracownika | Widoczna zakładka "Usługi" | ✅ |
| 1.2 | Przypisz 2–3 usługi do pracownika | Checkbox zaznaczone, zapisane po kliknięciu | ✅ |
| 1.3 | Kalendarz → nowa rezerwacja → wybierz usługę | Dropdown pracownika filtruje tylko tych z przypisaną usługą | ✅ 🔧 |
| 1.4 | `GET /api/employees/[id]/services` | Zwraca przypisane usługi (JSON) | ✅ |
| 1.5 | Usuń przypisanie usługi | Pracownik znika z dropdownu w kalendarzu dla tej usługi | ✅ |

> 🔧 **Fix:** `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` — dodano per-cart-item filtering (`filteredEmployeesMap` + useEffect z fetch `/api/employees?serviceId=`). Stary dialog używał pełnej listy `employees`.

---

## Moduł 2 — Payroll (sprint-03)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 2.1 | Płace → widok dzienny | Tabela z prowizjami za dzisiaj | ✅ |
| 2.2 | Przełącz na widok tygodniowy | Aggregacja po pracownikach za tydzień | ✅ |
| 2.3 | Zmień datę/zakres | Dane się przeładowują poprawnie | ✅ |
| 2.4 | Zaloguj jako employee → wejdź w /payroll | Brak dostępu (redirect lub 403) | ✅ |

---

## Moduł 3 — Service add-ons UI (sprint-04)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 3.1 | Usługi → edytuj usługę → zakładka "Dodatki" | Widoczny edytor add-onów | ✅ |
| 3.2 | Dodaj add-on z ceną | Pojawia się na liście | ✅ |
| 3.3 | Booking dialog → usługa z add-onami | Add-ony dostępne do wyboru | ✅ 🔧 |
| 3.4 | Zarezerwuj z add-onem | Cena w podsumowaniu uwzględnia add-on | ✅ 🔧 |

> 🔧 **Fix:** `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` linia ~1302 — `onAddonSelect` zamieniało array na `[addonId]` (single-select). Poprawiono na toggle (multi-select).
> 🔧 **Fix:** `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` linia ~394 — `totalPrice` nie uwzględniał `price_delta` wybranych add-onów. Dodano `addonSum` do reduce.
> 💬 **UX feedback:** dialog edycji usługi jest wąski — dużo scrollowania.

---

## Moduł 4 — Gmail outbound (sprint-05/06) — 🌐 TYLKO PREVIEW

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 4.1 | Ustawienia → Integracje → Gmail Send | Widoczna sekcja z przyciskiem "Połącz z Google" | ⬜ |
| 4.2 | Kliknij Connect → OAuth flow Google | Redirect do Google, po autoryzacji wraca do app | ⬜ |
| 4.3 | Po połączeniu | Email konta widoczny, token w DB (`gmail_send_tokens`) | ⬜ |
| 4.4 | Wyślij testowy email | Email dostarczony | ⬜ |
| 4.5 | Rozłącz konto | Token usunięty, przycisk wraca do "Połącz" | ⬜ |

---

## Moduł 5 — Przelewy24 (sprint-07/08) — 🌐 WEBHOOK TYLKO PREVIEW

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 5.1 | Rezerwacja → widok detail | Przycisk "Opłać rezerwację" widoczny | ⬜ |
| 5.2 | Kliknij → redirect do P24 checkout | Strona P24 sandbox z kwotą rezerwacji | ⬜ |
| 5.3 | W P24 sandbox kliknij "Zapłać" | Webhook `POST /api/payments/booking/[id]/status` wywołany | ⬜ |
| 5.4 | Wróć do aplikacji | Rezerwacja oznaczona jako "Opłacona" | ⬜ |
| 5.5 | Płatności → Historia | Lista transakcji z datą, kwotą, statusem | ⬜ |
| 5.6 | `GET /api/payments/booking/history` | Paginowana historia JSON | ✅ (API 200, struktura: payments/total/page/limit) |

---

## Moduł 6 — Treatment plans (sprint-09/10)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 6.1 | Klienci → profil klienta → "Serie zabiegów" | Lista serii (pusta lub z danymi) | ✅ 🔧 |
| 6.2 | Utwórz nową serię zabiegów | Seria pojawia się na liście | ✅ 🔧 |
| 6.3 | Otwórz serię → sesje auto-tworzone | 3 sesje widoczne ze statusem "Zaplanowana" | ✅ |
| 6.4 | Oznacz sesję jako "Ukończona" | Status zmieniony, progress planu zaktualizowany | ✅ |
| 6.5 | `GET /api/treatment-plans` jako owner | Zwraca plany dla salonu | ✅ (feature flag włączony) |
| 6.6 | `GET /api/treatment-plans` jako employee | 403 | ✅ 🔧 |

> 🔧 **Fix:** `app/api/treatment-plans/route.ts` — GET nie miało role check. Dodano `if (role !== 'owner' && role !== 'manager') throw new ForbiddenError(...)`.

---

## Moduł 7 — Employee shifts (sprint-11/12)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 7.1 | Pracownicy → profil → "Zmiana" | Edytor godzin pracy widoczny | ✅ |
| 7.2 | Ustaw shift (np. pon 9:00–17:00) | Zapisany w DB, widoczny po odświeżeniu | ✅ |
| 7.3 | Shift rules → dodaj regułę | Reguła widoczna na liście | ✅ |
| 7.4 | Shift templates → stwórz szablon | Template zapisany | ✅ |
| 7.5 | Zastosuj template do pracownika | Grafik zaktualizowany zgodnie z templatem | ✅ |
| 7.6 | Kalendarz → rezerwacja poza godzinami pracy | Ostrzeżenie o godzinach pracy | ✅ 🔧 |

---

## Moduł 8 — Booking detail page

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| 8.1 | Kliknij rezerwację → `/bookings/[id]` | Pełny detail: klient, usługa, pracownik, status, cena | N/A — dialog pokrywa ten use case |
| 8.2 | Edytuj status rezerwacji z detail page | Zmiana zapisana, widoczna w kalendarzu | N/A |

---

## Regresja (cross-cutting)

| # | Krok | Oczekiwany wynik | Status |
|---|------|-----------------|--------|
| R.1 | `npx tsc --noEmit` | Zero błędów | ✅ |
| R.2 | Logowanie jako owner / manager / employee | Każda rola loguje się poprawnie | ✅ |
| R.3 | Sidebar jako employee | Brak: Płace, Płatności, Pracownicy (zarządzanie), Ustawienia biznesowe | ✅ |
| R.4 | Booking dialog bez add-onów | Flow działa jak przed zmianami | ✅ |
| R.5 | `POST /api/billing/webhook` (Stripe) | Webhook nadal działa po zmianach w route.ts | ✅ (P24 signature verified) |
| R.6 | Treatment plans istniejące z SS2.1 | Nie zepsute przez zmiany w sprint-09/10 | ✅ |

---

## Kolejność testowania

```
R.1  tsc clean                          ✅
  └── Moduł 1 (employee-services)       ✅
        └── Moduł 3 (add-ons)           ✅ (3.4 pozostało)
  └── Moduł 6 (treatment plans)         ← NEXT (6.1–6.4 UI)
  └── Moduł 7 (shifts)
  └── Moduł 8 (booking detail)
  └── Moduł 2 (payroll)                 ✅
R.2–R.6  regresja
  └── Deploy Preview
        └── Moduł 4 (Gmail OAuth)
        └── Moduł 5 (P24 webhook)
```

---

## Bugi znalezione i naprawione

| # | Plik | Opis | Fix |
|---|------|------|-----|
| B1 | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | Dropdown pracownika nie filtrował po serviceId | Dodano `filteredEmployeesMap` + useEffect |
| B2 | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | Add-ony działały jako single-select (radio) | Toggle multi-select |
| B5 | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | `totalPrice` nie sumował `price_delta` add-onów | Dodano `addonSum` w reduce |
| B6 | `app/(dashboard)/[slug]/calendar/booking-dialog.tsx` | Edit dialog nie ładował `booking_addons` — cena nie uwzględniała add-onów | Dodano useEffect ładujący `booking_addons` + `addonsTotal` do ceny |
| B3 | `app/api/treatment-plans/route.ts` | GET nie blokował employee (brak role check) | Dodano ForbiddenError dla non-owner/manager |
| B4 | `types/supabase.ts` | `supabase gen types` wrzucał komunikat upgrade CLI do pliku | Fix: `2>/dev/null` przy generowaniu |
