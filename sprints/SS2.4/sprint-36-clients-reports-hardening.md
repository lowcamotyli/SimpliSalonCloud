# Sprint SS2.4-36 - Klienci i raporty: Domkniecie acceptance criteria

## Cel
(P1) Domkniecie sprintow 31 i 32 po review. Funkcje sa widoczne, ale nie wszystkie acceptance criteria
sa jeszcze spelnione:
1. sortowanie klientow nie jest utrwalane w URL,
2. raport metod platnosci nie buckecuje nieznanych metod do "Inne",
3. raport godzin przepracowanych nie ma filtra pracownika w UI.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List reporting constraints for clients sorting, payment_method values, and employee hours calculations. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | clients indexes, payment fields, bookings duration |

## Zdiagnozowane problemy

- [ ] lista klientow sortuje tylko w local state
- [ ] refresh / deep-link nie zachowuje `sort` i `order`
- [ ] payment methods endpoint zwraca dowolne surowe wartosci zamiast `Inne`
- [ ] raport godzin ma backendowy `employeeId`, ale brak filtra w UI

## Zakres

### A - Clients list URL state (codex-main)
- [ ] `app/(dashboard)/[slug]/clients/page.tsx`
  - [ ] odczyt `sort` i `order` z URL przy starcie
  - [ ] klik sortowania aktualizuje URL
  - [ ] odswiezenie strony zachowuje sortowanie
- [ ] `components/clients/clients-list-view.tsx`
  - [ ] pozostaje cienkim widokiem, bez lokalnego source of truth dla sortu

### B - Reports backend cleanup (codex-dad)
- [ ] `app/api/reports/payment-methods/route.ts`
  - [ ] nieznane / puste metody trafiaja do bucketu `other` / `Inne`
- [ ] `app/api/reports/hours-worked/route.ts`
  - [ ] utrzymaj `employeeId` jako stabilny parametr kontraktu
  - [ ] dopisz brakujace guardy / walidacje jesli potrzebne

### C - Reports UI domkniecie (codex-main)
- [ ] `app/(dashboard)/[slug]/reports/page.tsx`
  - [ ] filtr pracownika dla "Godziny przepracowane"
  - [ ] wysylanie `employeeId` do API
  - [ ] czytelny stan "wszyscy pracownicy"
  - [ ] legenda / labels metod platnosci zgodne z bucketingiem backendu

## Work packages

- ID: pkg-clients-url-state | Type: implementation | Worker: codex-main | Outputs: URL-backed clients sorting
- ID: pkg-reports-api | Type: implementation | Worker: codex-dad | Outputs: payment/hours API cleanup
- ID: pkg-reports-ui | Type: implementation | Worker: codex-main | Inputs: pkg-reports-api | Outputs: employee filter + reports polish

## Verification

```bash
npx tsc --noEmit
# Test: /clients?sort=last_visit_at&order=asc -> lista sortuje sie poprawnie po refreshu
# Test: payment_method spoza whitelisty trafia do bucketu "Inne"
# Test: raport godzin po wyborze pracownika pokazuje tylko jego dane
```

## Acceptance criteria

- [ ] Sortowanie klientow jest utrwalone w URL
- [ ] Widok listy klientow zachowuje sort po odswiezeniu i deep-linku
- [ ] Raport metod platnosci buckecuje wartosci nieznane do "Inne"
- [ ] Raport godzin przepracowanych ma filtr pracownika w UI
- [ ] `npx tsc --noEmit` -> clean

