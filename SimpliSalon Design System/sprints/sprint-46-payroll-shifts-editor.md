# Sprint SS2.4-46 - Payroll + Shifts tab + Booking services editor

## Cel

Trzy duze komponenty pomocnicze ktore renderuja obiekty biznesowe bez interaktywnosci:
- `payroll/page.tsx` — lista pracownikow z rozliczeniami
- `employee-shifts-tab.tsx` — zakladka zmian pracownika z rezerwacjami
- `booking-services-editor.tsx` — edytor uslug w rezerwacji

Wszystkie trzy ida rownolegle (brak wspolnych importow).

Zaleznosc: Sprint 41 zamkniety.

## Architektura - dokumenty referencyjne

Brak arch docs — sprint dotyczy warstwy UI, nie danych.

## Zdiagnozowane problemy

- [ ] `payroll/page.tsx` (482 linii) — nazwy pracownikow jako plain text
- [ ] `employee-shifts-tab.tsx` (710 linii) — rezerwacje w zmianach bez kliknalnych obiektow
- [ ] `booking-services-editor.tsx` (697 linii) — uslugi w edytorze rezerwacji bez ObjectPill/ObjectLink

## Zakres

### A — Payroll (codex-dad)

Plik: `app/(dashboard)/[slug]/payroll/page.tsx` (482 linii)

- [ ] Kazdy wiersz pracownika: `<ObjectCell type="worker" id={emp.id} label={emp.name} slug={slug} meta={emp.role} showActions={false} />`
- [ ] Jesli sa szczegoly rozliczenia per pracownik — dodaj `<ObjectTrigger type="worker">` z akcja "Pokaz grafik"
- [ ] Nie zmieniac tabel wynagrodzen, kalkulacji, eksportu CSV

### B — Shifts tab (codex-dad, rownolegle z A)

Plik: `components/employees/employee-shifts-tab.tsx` (710 linii)

- [ ] Zidentyfikuj miejsca gdzie renderowane sa rezerwacje w kontekscie zmiany
- [ ] Kazda rezerwacja w slocie zmiany:
  - Klient: `<ObjectLink type="client" id={b.client_id} label={b.client_name} slug={slug} />`
  - Usluga: `<ObjectPill type="service" id={b.service_id} label={b.service_name} slug={slug} />`
- [ ] Nie zmieniac logiki zmian, edycji slotow, przeplywu dodawania zmiany

### C — Booking services editor (codex-dad, rownolegle z A i B)

Plik: `components/calendar/booking-services-editor.tsx` (697 linii)

- [ ] W liscie wybranych uslug: usluga jako `<ObjectPill type="service" id={svc.id} label={svc.name} slug={slug} />`
- [ ] W wynikach wyszukiwania uslug (jesli jest lista): usluga jako `<ObjectLink type="service">`
- [ ] Nie usuwac przyciskow usuniecia uslugi z rezerwacji
- [ ] Nie zmieniac logiki dodawania/usuwania uslug, cen, czasu trwania

## Dispatch commands

### Pkg A — payroll (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payroll/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectCell.

Goal: Add ObjectCell for each employee in payroll table.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payroll/page.tsx

Changes:
1. Import ObjectCell from '@/components/objects'.
2. Find where employee names are rendered in payroll rows.
3. Replace employee name cell with: <ObjectCell type='worker' id={emp.id} label={emp.name ?? emp.full_name} slug={slug} meta={emp.role} showActions={false} />
4. Do NOT touch salary columns, totals, date filters, or CSV export.

Constraints:
- Preserve all existing payroll calculation display
- slug from params

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — shifts tab (codex-dad, rownolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/employees/employee-shifts-tab.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectLink, ObjectPill.

Goal: Add clickable ObjectLink and ObjectPill to bookings shown inside employee shifts.

File: /mnt/d/SimpliSalonCLoud/components/employees/employee-shifts-tab.tsx

Changes:
1. Import ObjectLink, ObjectPill from '@/components/objects'.
2. Find places where bookings or appointments are rendered within shift slots.
3. For each booking in a shift:
   a. Client name → <ObjectLink type='client' id={b.client_id} label={b.client_name ?? 'Klient'} slug={slug} />
   b. Service name → <ObjectPill type='service' id={b.service_id} label={b.service_name ?? 'Usluga'} slug={slug} />
4. Add e.stopPropagation() on ObjectLink and ObjectPill onClick.
5. Do NOT change shift editing, slot creation, or any non-booking parts.

Constraints:
- slug is available as prop or params in this component — use what already exists
- Do NOT add useParams() if slug is already a prop

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C — booking services editor (codex-dad, rownolegle z A i B)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/calendar/booking-services-editor.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectPill, ObjectLink.

Goal: Display selected and searched services as ObjectPill/ObjectLink in booking services editor.

File: /mnt/d/SimpliSalonCLoud/components/calendar/booking-services-editor.tsx

Changes:
1. Import ObjectPill, ObjectLink from '@/components/objects'.
2. Find where selected services are displayed in the editor (the list of chosen services).
   Replace service name text with: <ObjectPill type='service' id={svc.id} label={svc.name} slug={slug} />
3. If there is a search results list showing available services to add:
   Replace service name in search results with: <ObjectLink type='service' id={svc.id} label={svc.name} slug={slug} />
4. Keep remove/delete buttons for each selected service.
5. Do NOT change search logic, price editing, duration editing, or booking submission.
6. Add e.stopPropagation() on ObjectPill and ObjectLink to prevent closing the editor.

Constraints:
- slug comes from props or params — check component signature first
- Do NOT change any existing functionality

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-46-payroll | Type: implementation | Worker: codex-dad | Inputs: payroll/page.tsx | Outputs: ObjectCell w payroll
- ID: pkg-46-shifts | Type: implementation | Worker: codex-dad | Inputs: employee-shifts-tab.tsx | Outputs: ObjectLink/ObjectPill w zmianach
- ID: pkg-46-editor | Type: implementation | Worker: codex-dad | Inputs: booking-services-editor.tsx | Outputs: ObjectPill/ObjectLink w edytorze uslug

## Verification

```bash
npx tsc --noEmit
# Test manualny: payroll → klik w nazwe pracownika → /employees/[id]
# Test manualny: shifts tab → klik w klienta w zmienie → /clients/[id]
# Test manualny: booking editor → wybrana usluga jako ObjectPill
```

## Acceptance criteria

- [ ] Payroll: kazdy pracownik jako ObjectCell z klikalna nazwa
- [ ] Shifts tab: rezerwacje w zmianach maja ObjectLink (klient) i ObjectPill (usluga)
- [ ] Booking services editor: wybrane uslugi jako ObjectPill
- [ ] Brak konfliktu klikniec (e.stopPropagation wszedzie)
- [ ] `npx tsc --noEmit` → clean
