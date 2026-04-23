# Sprint SS2.4-29 — Nieobecności (zakresy dat) + Rezerwacja czasu

## Cel
(P1) Trzy powiązane funkcje zarządzania dostępnością pracownika:
1. **Nieobecności (urlopy)** — pracownik/manager może oznaczyć zakres dat jako nieobecność (od-do). Pracownik niedostępny do rezerwacji w tym czasie.
2. **Rezerwacja czasu** — pracownik może zablokować konkretny slot czasowy (np. 14:00–15:00) bez wizyty klienta. Slot niedostępny w publicznej rezerwacji.
3. **Wpisy w menu kalendarza** — obok "Nowa wizyta": dropdown z opcjami "Rezerwacja czasu" i "Nieobecność".

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/data-architecture.md. List: (1) existing tables for employee availability/blocking, (2) how public booking checks availability, (3) any existing absences or time-off table. FORMAT: Bulleted list. Do NOT summarize.' bash ~/.claude/scripts/dad-exec.sh
DAD_PROMPT='Read /mnt/d/SimpliSalonCLoud/docs/architecture/event-architecture.md. List any availability events, calendar blocking patterns, or async flows for scheduling. FORMAT: Bulleted list.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `docs/architecture/data-architecture.md` | Availability blocking, existing tables |
| `docs/architecture/event-architecture.md` | Async flows, booking availability check |
| `docs/architecture/security-model.md` | Kto może tworzyć nieobecności (tylko własne / manager dla innych) |

**Kluczowe constraints:**
- Pracownik: może tworzyć tylko swoje nieobecności/rezerwacje
- Manager/Owner: może tworzyć dla dowolnego pracownika swojego salonu
- Nieobecność wielodniowa: blokuje WSZYSTKIE sloty w zakresie dat
- Rezerwacja czasu: blokuje pojedynczy slot (jak wizyta, ale bez klienta)
- Public booking API: MUSI respektować oba typy blokad — sprawdź istniejące zapytanie availability

## Typy blokad — specyfikacja

### Nieobecność (`employee_absences`)
```
- employee_id
- salon_id
- start_date (DATE)
- end_date (DATE)
- reason (TEXT, optional): 'vacation', 'sick_leave', 'other', lub free text
- created_by (user_id)
```

### Rezerwacja czasu (`time_reservations`)
```
- employee_id
- salon_id
- start_at (TIMESTAMPTZ)
- end_at (TIMESTAMPTZ)
- title (TEXT, optional): opis np. "Szkolenie", "Przerwa"
- created_by (user_id)
```

Rozważ czy można to połączyć w jedną tabelę z `type` enum — zależy od istniejącej struktury.

## Zakres

### DB (codex-dad)
- [ ] Migracja: tabela `employee_absences` (zakresy dat)
- [ ] Migracja: tabela `time_reservations` (blokada konkretnego slotu)
- [ ] RLS na obu tabelach: pracownik widzi/modyfikuje swoje, manager widzi/modyfikuje wszystkie w salonie
- [ ] Indeksy: `(employee_id, start_date, end_date)` dla absences; `(employee_id, start_at, end_at)` dla time_reservations

### API — Nieobecności (codex-main)
- [ ] `app/api/absences/route.ts` — GET (lista dla salonu/pracownika), POST (nowa nieobecność)
- [ ] `app/api/absences/[id]/route.ts` — PATCH, DELETE
- [ ] Walidacja: start_date <= end_date, zakres nie może być w przeszłości (ostrzeżenie, nie blokada)

### API — Rezerwacje czasu (codex-dad)
- [ ] `app/api/time-reservations/route.ts` — GET, POST
- [ ] `app/api/time-reservations/[id]/route.ts` — PATCH, DELETE
- [ ] Integracja z availability check: endpoint sprawdzający dostępność musi uwzględniać time_reservations

### UI — Zarządzanie nieobecnościami (codex-main)
- [ ] Nowy widok: `app/(dashboard)/[slug]/employees/absences/page.tsx` LUB modal w profilu pracownika
  - Lista nieobecności (tabela: pracownik, od, do, powód)
  - Przycisk "Dodaj nieobecność" → formularz z date range picker
  - Manager widzi wszystkich, pracownik widzi swoje
- [ ] Date range picker: `from` i `to` w jednym komponencie (np. shadcn Calendar z range mode)

### UI — Rezerwacja czasu z kalendarza (codex-dad)
- [ ] Nowy komponent `TimeReservationDialog` — podobny do BookingDialog
  - Pola: pracownik (pre-filled), data/czas od, czas do, tytuł (opcjonalnie)
  - POST → `app/api/time-reservations`
- [ ] Wyświetlanie w kalendarzu: blok "Zarezerwowane" (inny kolor niż wizyta, bez nazwy klienta)

### UI — Menu kalendarza (codex-main)
- [ ] Przycisk "Nowa wizyta" → zamień na SplitButton lub DropdownButton
  - Opcja 1: "Nowa wizyta" (istniejąca akcja)
  - Opcja 2: "Rezerwacja czasu" → otwiera `TimeReservationDialog`
  - Opcja 3: "Nieobecność" → otwiera dialog nieobecności (date range)

## Work packages

- ID: pkg-db | Type: migration | Worker: codex-dad | Outputs: 2 migracje SQL
- ID: pkg-api-absences | Type: implementation | Worker: codex-main | Inputs: pkg-db (gen types)
- ID: pkg-api-time-res | Type: implementation | Worker: codex-dad | Inputs: pkg-db (gen types)
- ID: pkg-ui-absences | Type: implementation | Worker: codex-main | Inputs: pkg-api-absences
- ID: pkg-ui-time-res | Type: implementation | Worker: codex-dad | Inputs: pkg-api-time-res
- ID: pkg-calendar-menu | Type: implementation | Worker: codex-main | Inputs: pkg-ui-time-res

## Verification

```bash
supabase db push
supabase gen types typescript --linked > types/supabase.ts
npx tsc --noEmit
# Test: dodaj nieobecność pracownika od jutra do za 3 dni → sprawdź czy publiczna rezerwacja blokuje sloty
# Test: zarezerwuj czas 10:00-11:00 → sprawdź czy slot zablokowany w kalendarzu
# Test: menu kalendarza → "Rezerwacja czasu" otwiera dialog
# Test: pracownik nie może edytować nieobecności innego pracownika (RBAC)
```

## Acceptance criteria

- [ ] Manager/owner może dodać nieobecność pracownika z zakresem dat od-do
- [ ] Pracownik może dodać tylko swoją nieobecność
- [ ] Nieobecność blokuje dostępność w publicznej rezerwacji
- [ ] Z kalendarza można otworzyć "Rezerwacja czasu" i "Nieobecność"
- [ ] Rezerwacja czasu pojawia się w kalendarzu jako inny kolor blok
- [ ] `npx tsc --noEmit` → clean
