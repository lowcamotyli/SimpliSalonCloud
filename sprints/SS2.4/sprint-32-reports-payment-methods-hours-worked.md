# Sprint SS2.4-32 — Raporty: Metody płatności + Godziny przepracowane

## Cel
(P2) Dwa nowe raporty:
1. **Sposoby zakończenia transakcji** — ile wizyt zakończono gotówką, kartą, przelewem, online (Przelewy24), itp.
2. **Godziny przepracowane przez pracownika** — suma godzin w wybranym zakresie dat, podział na pracowników.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List: (1) bookings table structure — payment method field, status field, (2) any existing payment/transaction log tables, (3) employee schedule/hours tracking. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Pola płatności w bookings, godziny pracownika |

**Kluczowe constraints:**
- Wszystkie zapytania raportowe muszą filtrować po `salon_id`
- Godziny przepracowane = suma `(end_time - start_time)` z zakończonych wizyt (`status = 'completed'`)
  LUB dedykowana tabela obecności — sprawdź przed dispatchem
- Metody płatności: sprawdź jakie wartości są w `bookings.payment_method` (enum vs free text)

## Sprawdzenie stanu przed dispatchem

```bash
# Sprawdź pola płatności w bookings
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/supabase/migrations. Find the bookings table definition and list all payment-related columns and their types. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh

# Sprawdź istniejące raporty
ls d:/SimpliSalonCLoud/app/api/reports/
ls d:/SimpliSalonCLoud/app/**/reports/ -d 2>/dev/null
```

## Zakres

### A — Raport: Metody płatności (codex-main)

**API:**
- [ ] `app/api/reports/payment-methods/route.ts`
  - GET params: `salonId`, `from`, `to`
  - Response: `{ method: string, count: number, total_value: number }[]`
  - Query: GROUP BY payment_method na ukończonych wizytach w zakresie dat
  - Nieznana metoda → bucket "Inne"

**UI:**
- [ ] Nowa karta/sekcja w `app/(dashboard)/[slug]/reports/page.tsx`
  - Pie chart lub bar chart z metodami płatności
  - Legenda z liczbą transakcji i wartością
  - Filter: zakres dat (ten sam co inne raporty)
  - Eksport CSV (opcjonalnie P3)

### B — Raport: Godziny przepracowane (codex-dad)

**API:**
- [ ] `app/api/reports/hours-worked/route.ts`
  - GET params: `salonId`, `from`, `to`, `employeeId` (opcjonalne — wszystkich jeśli brak)
  - Response: `{ employee_id, employee_name, total_minutes: number, appointments_count: number }[]`
  - Obliczenie: suma czasu trwania ukończonych wizyt wg pracownika
  - Jeśli istnieje dedykowana tabela obecności — użyj jej zamiast wizyt

**UI:**
- [ ] Nowa karta/sekcja w raporty
  - Tabela: pracownik | godziny | liczba wizyt | śr. czas wizyty
  - Sortowanie po kolumnach
  - Filter: zakres dat + opcjonalnie wybór pracownika
  - Eksport CSV (opcjonalnie P3)

## Work packages

- ID: pkg-api-payment | Type: implementation | Worker: codex-main | Outputs: payment-methods API
- ID: pkg-api-hours | Type: implementation | Worker: codex-dad | Outputs: hours-worked API
- ID: pkg-ui-payment | Type: implementation | Worker: codex-main | Inputs: pkg-api-payment | Outputs: chart karta
- ID: pkg-ui-hours | Type: implementation | Worker: codex-dad | Inputs: pkg-api-hours | Outputs: tabela karta

## Verification

```bash
npx tsc --noEmit
# Test A: salon z kilkoma metodami płatności → sprawdź poprawność sum
# Test B: wybierz zakres 30 dni → sprawdź czy godziny są sumowane poprawnie
# Test: filtr dat zmienia dane w obu raportach
# Security: zapytania zawierają salon_id filter
```

## Acceptance criteria

- [ ] Raport "Metody płatności" — zestawienie wg metod z liczbą i wartością transakcji
- [ ] Raport "Godziny przepracowane" — tabela pracowników z godzinami w wybranym zakresie
- [ ] Oba raporty respektują filtr zakresu dat
- [ ] Brak dostępu bez autoryzacji (salon_id sprawdzany server-side)
- [ ] `npx tsc --noEmit` → clean
