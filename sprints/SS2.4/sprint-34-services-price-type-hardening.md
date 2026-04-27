# Sprint SS2.4-34 - Typy cen uslug: Spojnosc API + Booking publiczny

## Cel
(P0) Domkniecie wdrozenia sprintu 26 po review. Aktualnie `price_type` jest zapisany w DB,
ale nie przeplywa poprawnie przez glowne API panelu i nie jest respektowany przez publiczny booking
przy zapisie ceny do rezerwacji.

Cel sprintu:
1. Przywrocic pelna spojnosc `price_type` w admin API / UI.
2. Dopiac logike publicznego bookingu dla typow `fixed`, `variable`, `from`, `hidden`, `free`.
3. Wyeliminowac ryzyko nadpisywania poprawnego `price_type` podczas edycji uslugi.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List all service price fields, booking price snapshot rules, and client-visible pricing constraints for public booking. FORMAT: Bulleted list. Do NOT omit exceptions.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Services -> bookings price snapshot |
| `docs/architecture/multi-tenant-architecture.md` | salon_id / tenant isolation |

## Zdiagnozowane problemy

- [ ] `GET /api/services` nie zwraca `price_type` w zagniezdzonej strukturze dla UI
- [ ] Lista uslug i edycja uslugi fallbackuja do `fixed`, wiec ukrywaja realny stan danych
- [ ] Publiczny booking zapisuje `base_price = service.price` bez semantyki `price_type`
- [ ] Brakuje testow regresyjnych dla mapowania `price_type`

## Zakres

### A - Admin API / UI consistency (codex-main)
- [ ] `app/api/services/route.ts` - dodaj `price_type` do payloadu `GET /api/services`
- [ ] `hooks/use-services.ts` - upewnij sie, ze typy klienta zawieraja `price_type`
- [ ] `app/(dashboard)/[slug]/services/page.tsx`
  - [ ] lista uslug odczytuje realny `price_type`
  - [ ] edycja uslugi nie resetuje typu ceny do `fixed`
  - [ ] statystyki / helpery obsluguja `free` i `hidden` bez falszywych agregatow

### B - Public booking price semantics (codex-dad)
- [ ] `app/api/public/services/route.ts`
  - [ ] `hidden` -> brak surowej ceny dla klienta
  - [ ] dodaj jawny, stabilny contract dla `price_type`
- [ ] `app/api/public/bookings/route.ts`
  - [ ] ustal logike `base_price` dla wszystkich 5 typow
- [ ] `app/api/public/bookings/group/route.ts`
  - [ ] ta sama semantyka co single booking
- [ ] jezeli potrzeba, wydziel wspolny helper do wyliczania booking price snapshot

### C - Regression tests (codex-main)
- [ ] test integracyjny lub unit dla `GET /api/services` z `price_type`
- [ ] test dla public booking `hidden`
- [ ] test dla `free`
- [ ] test dla `variable` / `from` zgodnie z ustalona semantyka domenowa

## Work packages

- ID: pkg-admin-api-ui | Type: implementation | Worker: codex-main | Outputs: admin API + services UI consistency
- ID: pkg-public-booking | Type: implementation | Worker: codex-dad | Outputs: public booking price semantics
- ID: pkg-tests | Type: review | Worker: codex-main | Inputs: pkg-admin-api-ui, pkg-public-booking | Outputs: regression tests

## Verification

```bash
npx tsc --noEmit
# Test: usluga z price_type='hidden' zachowuje typ po odswiezeniu i edycji
# Test: usluga z price_type='free' zapisuje booking z poprawnym snapshotem ceny
# Test: publiczne API zwraca price_type i nie ujawnia price dla hidden
```

## Acceptance criteria

- [ ] `GET /api/services` zwraca `price_type` dla panelu admina
- [ ] Edycja uslugi nie nadpisuje typu ceny do `fixed`
- [ ] Public booking respektuje semantyke wszystkich 5 typow cen
- [ ] `hidden` nie ujawnia ceny klientowi przez public API
- [ ] `npx tsc --noEmit` -> clean

