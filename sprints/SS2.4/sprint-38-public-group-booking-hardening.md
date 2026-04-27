# Sprint SS2.4-38 - Publiczny booking grupowy: Terms + sprzet + kontrakt

## Cel
(P0) Domkniecie krytycznych luk po review publicznego bookingu grupowego. Aktualne ryzyka:
1. flow grupowy nie respektuje `terms_accepted`, mimo ze single booking to egzekwuje,
2. `equipment_bookings` dla grupy zapisuja sie dla czasu wykonania requestu zamiast dla terminu wizyt,
3. kontrakt response/request grupy rozjezdza sie wzgledem single booking w obszarze compliance.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md and /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md. List all constraints for public bookings, booking terms acceptance, and equipment booking timestamps. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | bookings, visit groups, equipment bookings |
| `docs/architecture/security-model.md` | compliance / public contract assumptions |

## Zdiagnozowane problemy

- [ ] `POST /api/public/bookings/group` nie pobiera `salon_settings` i nie waliduje `terms_accepted`
- [ ] grupowy request nie ma jawnego kontraktu dla terms acceptance
- [ ] wpisy `equipment_bookings` po RPC dostaja `starts_at = now()` zamiast czasu wizyty
- [ ] brak testu regresyjnego dla sprzetu i terms w flow grupowym

## Zakres

### A - Terms parity vs single booking (codex-dad)
- [ ] `app/api/public/bookings/group/route.ts`
  - [ ] pobierz `salon_settings` tak jak w single booking
  - [ ] dodaj i zwaliduj `terms_accepted` gdy salon wymaga regulaminu
  - [ ] utrzymaj kompatybilny blad domenowy `terms_not_accepted`
- [ ] jezeli potrzeba, dopnij schema validator dla requestu grupowego

### B - Correct equipment booking timestamps (codex-dad)
- [ ] `app/api/public/bookings/group/route.ts`
  - [ ] po RPC zapisuj `equipment_bookings` na podstawie `item.date`, `item.time` i duration
  - [ ] zachowaj mapowanie `rpcResult.bookings[i] -> items[i]`
  - [ ] upewnij sie, ze kazdy booking grupy blokuje sprzet dokladnie na swoim slocie

### C - Regression coverage (codex-dad)
- [ ] test: salon z terms -> group booking bez `terms_accepted` zwraca 422
- [ ] test: group booking zapisuje `equipment_bookings.starts_at/ends_at` zgodnie z requestem
- [ ] test: wieloelementowa grupa nie miesza slotow sprzetu pomiedzy pozycjami

## Work packages

- ID: pkg-group-terms | Type: implementation | Worker: codex-dad | Outputs: terms parity w group booking
- ID: pkg-group-equipment-bookings | Type: implementation | Worker: codex-dad | Outputs: poprawne timestamps `equipment_bookings`
- ID: pkg-group-regression | Type: review | Worker: codex-dad | Inputs: pkg-group-terms, pkg-group-equipment-bookings | Outputs: testy regresyjne

## Verification

```bash
npx tsc --noEmit
# Test: salon z terms -> group booking bez terms_accepted => 422 terms_not_accepted
# Test: group booking z 2 pozycjami zapisuje equipment_bookings na slotach z requestu, nie na now()
# Test: kolejny request na ten sam sprzet i slot wpada w konflikt
```

## Acceptance criteria

- [ ] Group booking respektuje `terms_accepted` tak samo jak single booking
- [ ] `equipment_bookings` w group booking sa zapisywane dla rzeczywistych slotow wizyt
- [ ] Kontrakt group booking jest zgodny z domena i nie omija compliance
- [ ] `npx tsc --noEmit` -> clean
