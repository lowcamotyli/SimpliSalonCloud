# Sprint SS2.4-35 - Kalendarz i dostepnosc: Timezone + RBAC + Flow nieobecnosci

## Cel
(P0) Domkniecie sprintu 29 po review wdrozenia. Aktualne ryzyka:
1. `time_reservations` moga byc przesuwane przez konwersje timezone.
2. RLS dla `employee_absences` i `time_reservations` jest szerszy niz wymaga spec.
3. Menu kalendarza nie otwiera flow nieobecnosci zgodnie z zalozonym UX.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md and /mnt/d/SimpliSalonCLoud/docs/architecture/security-model.md. List constraints for employee availability, timezone handling, and who may create or edit absences/time blocks. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | availability / blocking model |
| `docs/architecture/security-model.md` | employee vs manager RBAC |
| `docs/architecture/event-architecture.md` | side effects around scheduling |

## Zdiagnozowane problemy

- [ ] dialog rezerwacji czasu serializuje lokalny czas przez `toISOString()`
- [ ] availability liczy bloki przez UTC hours i moze blokowac zly slot
- [ ] RLS pozwala wszystkim czlonkom salonu operowac na wszystkich wpisach
- [ ] z menu kalendarza "Nieobecnosc" prowadzi na osobna strone zamiast otwierac flow

## Zakres

### A - Timezone-safe reservation flow (codex-main)
- [ ] `components/calendar/time-reservation-dialog.tsx`
  - [ ] zapisz lokalny slot bez przesuniecia strefowego
  - [ ] dodaj walidacje czasu start/end w kontekscie lokalnej strefy salonu
- [ ] `app/api/time-reservations/route.ts`
  - [ ] doprecyzuj contract daty/czasu
  - [ ] waliduj nakladanie i zakres w spojnym modelu czasu
- [ ] `app/api/public/availability/route.ts`
  - [ ] przelicz bloki `time_reservations` bez bledow UTC/local
- [ ] `app/api/public/availability/dates/route.ts`
  - [ ] ta sama poprawka dla agregacji dni z dostepnoscia

### B - RLS / RBAC hardening (codex-dad)
- [ ] nowa migracja naprawcza do policies `employee_absences`
- [ ] nowa migracja naprawcza do policies `time_reservations`
- [ ] pracownik widzi i modyfikuje tylko swoje wpisy
- [ ] manager/owner zarzadza wszystkimi wpisami w swoim salonie
- [ ] sprawdz zgodnosc API z nowymi policy constraints

### C - Calendar UX domkniecie (codex-main)
- [ ] `app/(dashboard)/[slug]/calendar/page.tsx`
  - [ ] opcja "Nieobecnosc" uruchamia bezposredni flow tworzenia
  - [ ] flow wykorzystuje date range zgodny ze sprintem 29
- [ ] jezeli strona `employees/absences` zostaje jako pelny widok zarzadzania, dodaj osobny szybki dialog z kalendarza

## Work packages

- ID: pkg-timezone | Type: implementation | Worker: codex-main | Outputs: timezone-safe time reservations + availability
- ID: pkg-rls | Type: migration | Worker: codex-dad | Outputs: RLS hardening migration
- ID: pkg-calendar-ux | Type: implementation | Worker: codex-main | Inputs: pkg-timezone | Outputs: calendar absence flow

## Verification

```bash
npx tsc --noEmit
# Test: utworz time reservation 10:00-11:00 i sprawdz ten sam slot w availability/public booking
# Test: employee nie moze odczytac ani edytowac wpisu innego employee
# Test: z menu kalendarza "Nieobecnosc" otwiera flow tworzenia bez opuszczania kontekstu
```

## Acceptance criteria

- [ ] Brak przesuniecia slotow przez timezone dla `time_reservations`
- [ ] Public availability blokuje dokladnie te sloty, ktore zapisano
- [ ] RLS odpowiada specyfikacji employee vs manager/owner
- [ ] Kalendarz otwiera flow "Nieobecnosc" zgodnie ze sprintem 29
- [ ] `npx tsc --noEmit` -> clean

