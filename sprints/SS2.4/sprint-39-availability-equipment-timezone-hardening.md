# Sprint SS2.4-39 - Availability i sprzet: domkniecie timezone end-to-end

## Cel
(P0) Domkniecie timezone-safe flow dla sprzetu i public availability. Po sprintach 35 i 37 nadal zostaly luki:
1. availability liczy blokady sprzetu przez UTC day bounds,
2. single i group public booking sprawdzaja sprzet przez `${date}T${time}:00Z`,
3. rezultat moze sie rozjechac od realnego lokalnego slotu salonu przy DST i salonach poza UTC.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md and /mnt/d/SimpliSalonCLoud/docs/architecture/event-architecture.md. List constraints for availability, salon timezone, and equipment blocking windows. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | availability, bookings, equipment windows |
| `docs/architecture/event-architecture.md` | side effects wokol rezerwacji |

## Zdiagnozowane problemy

- [ ] `app/api/public/availability/route.ts` liczy equipment blocks przez `T00:00:00.000Z` i `getUTCHours()`
- [ ] `app/api/public/availability/dates/route.ts` ma ten sam problem dla bucketowania dni
- [ ] `app/api/public/bookings/route.ts` buduje slot sprzetu przez `${date}T${time}:00Z`
- [ ] `app/api/public/bookings/group/route.ts` ma identyczny problem dla walidacji availability

## Zakres

### A - Availability timezone consistency (codex-dad)
- [ ] `app/api/public/availability/route.ts`
  - [ ] day bounds dla sprzetu wyliczaj w timezone salonu
  - [ ] mapuj `equipment_bookings` do minut lokalnych salonu, nie przez UTC hours
- [ ] `app/api/public/availability/dates/route.ts`
  - [ ] ta sama poprawka dla zakresu dni
  - [ ] bucketowanie dni z availability ma byc zgodne z lokalnym kalendarzem salonu

### B - Booking equipment checks in salon timezone (codex-dad)
- [ ] `app/api/public/bookings/route.ts`
  - [ ] sprawdz availability sprzetu na podstawie lokalnego slotu salonu
- [ ] `app/api/public/bookings/group/route.ts`
  - [ ] ta sama poprawka dla kazdego itemu
- [ ] jezeli potrzeba, wydziel helper do budowy timezone-safe `starts_at` / `ends_at`

### C - Regression coverage (codex-dad)
- [ ] test: slot sprzetu w salon timezone blokuje availability na tej samej lokalnej godzinie
- [ ] test: single booking i availability zgadzaja sie dla salonu z nie-UTC timezone
- [ ] test: group booking nie przechodzi, gdy lokalny slot sprzetu jest zajety

## Work packages

- ID: pkg-availability-equipment-tz | Type: implementation | Worker: codex-dad | Outputs: timezone-safe equipment blocks w availability
- ID: pkg-public-booking-equipment-tz | Type: implementation | Worker: codex-dad | Outputs: timezone-safe equipment checks w single/group booking
- ID: pkg-equipment-tz-regression | Type: review | Worker: codex-dad | Inputs: pkg-availability-equipment-tz, pkg-public-booking-equipment-tz | Outputs: testy regresyjne

## Verification

```bash
npx tsc --noEmit
# Test: salon timezone Europe/Warsaw, slot 10:00 lokalnie -> availability blokuje 10:00 lokalnie
# Test: DST boundary nie przesuwa blokady sprzetu na inna godzine
# Test: single/group booking konfliktuje sie z juz istniejacym equipment_booking dla lokalnego slotu
```

## Acceptance criteria

- [ ] Public availability liczy blokady sprzetu w timezone salonu, nie przez UTC shortcut
- [ ] Single i group public booking sprawdzaja sprzet dla poprawnego lokalnego slotu
- [ ] Availability i booking daja spojny wynik dla tego samego slotu
- [ ] `npx tsc --noEmit` -> clean
