# Sprint SS2.4-44 - Bookings list + Services list

## Cel

Dwa duze widoki tabelaryczne: lista rezerwacji i lista uslug. Kazdy wiersz musi pokazywac
obiekty biznesowe jako klikalne ObjectCell / ObjectLink / ObjectPill z RelatedActionsMenu.
To najwazniejsze widoki po kalendarzu — tutaj managerowie wykonuja wiekszosc codziennej pracy.

Zaleznosc: Sprint 41 zamkniety. Sprint 43 moze isca rownolegle.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract section 09.6 (Table cell — object variant) and section 09.3 (booking row). List: exact layout of avatar+name+meta, column width constraints, action trigger position, long label handling. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` | sekcja 09.6 table cell, 09.3 booking row |
| `SimpliSalon Design System/revamp/tokens-v3.css` | tokeny kolorow typow obiektow |

## Zdiagnozowane problemy

- [ ] `bookings/page.tsx` nie uzywa components/objects — rendering plain text klient/pracownik/usluga
- [ ] `services/page.tsx` nie uzywa components/objects — lista uslug bez interaktywnosci
- [ ] Brak stopPropagation miedzy klikaniem wiersza a klikaniem objetku w obu widokach

## Zakres

### A — Bookings list (codex-dad)

Plik: `app/(dashboard)/[slug]/bookings/page.tsx` (414 linii)

- [ ] Zaimportuj `ObjectCell`, `ObjectLink`, `ObjectPill`, `ObjectTrigger` z `@/components/objects`
- [ ] Kazdy wiersz rezerwacji:
  - kolumna klient: `<ObjectCell type="client" id={b.client_id} label={b.client_name} slug={slug} meta={b.client_phone} showActions={false} />`
  - kolumna pracownik: `<ObjectLink type="worker" id={b.employee_id} label={b.employee_name} slug={slug} showDot />`
  - kolumna usluga: `<ObjectPill type="service" id={b.service_id} label={b.service_name} slug={slug} />`
  - kolumna akcje: `<ObjectTrigger type="booking" id={b.id} label={b.client_name} slug={slug} meta={b.booking_date} />`
- [ ] Klik w wiersz (puste tlo, czas, status, cena) → `router.push(/${slug}/bookings/${b.id})`
- [ ] ObjectCell, ObjectLink, ObjectTrigger maja `onClick e.stopPropagation()`
- [ ] Dlugie nazwy: `max-w-[160px] truncate` na ObjectCell i ObjectLink
- [ ] Nie zmieniac filtrowania, sortowania, paginacji, data fetching

### B — Services list (codex-dad, rownolegle z A)

Plik: `app/(dashboard)/[slug]/services/page.tsx` (1213 linii)

- [ ] Zaimportuj `ObjectCell`, `ObjectTrigger` z `@/components/objects`
- [ ] W kazdym miejscu gdzie renderowana jest usluga (lista, karta, group):
  - Zamien rendering nazwy na `<ObjectCell type="service" id={svc.id} label={svc.name} slug={slug} meta={svc.duration_min + ' min · ' + svc.base_price + ' zł'} showActions={false} />`
  - Dodaj `<ObjectTrigger type="service" id={svc.id} label={svc.name} slug={slug} meta={svc.category} />`
- [ ] Jesli uslugi sa w tabelce: ObjectCell w kolumnie nazwy, ObjectTrigger w kolumnie akcji
- [ ] Jesli uslugi sa na kartach (grid): ObjectCell na górze karty, ObjectTrigger w rogu karty
- [ ] Nie usuwaj istniejacych przyciskow edycji — ObjectTrigger DODAJ obok lub zamien
      istniejacy dropdown jezeli juz jest
- [ ] Nie zmieniac kategorii, filtrowania, danych, formularzy tworzenia/edycji

## Dispatch commands

### Pkg A — bookings list (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/bookings/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see available components.

Goal: Integrate interactive objects into bookings list rows.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/bookings/page.tsx

Changes:
1. Import ObjectCell, ObjectLink, ObjectPill, ObjectTrigger from '@/components/objects'.
2. Import useRouter from 'next/navigation' if not already present.
3. In each booking row:
   a. Client column: replace plain name with <ObjectCell type='client' id={b.client_id} label={b.client_name ?? 'Brak klienta'} slug={slug} showActions={false} className='max-w-[160px]' />
   b. Worker column: replace with <ObjectLink type='worker' id={b.employee_id} label={b.employee_name ?? 'Brak'} slug={slug} showDot />
   c. Service column: replace with <ObjectPill type='service' id={b.service_id} label={b.service_name ?? 'Brak'} slug={slug} />
   d. Actions column (or last column): add <ObjectTrigger type='booking' id={b.id} label={b.client_name ?? 'Wizyta'} slug={slug} meta={b.booking_date} />
4. Wrap each row in onClick={() => router.push(path to booking detail)} on the TR or row container.
5. Add e.stopPropagation() to onClick handlers of ObjectCell, ObjectLink, ObjectPill, ObjectTrigger.
6. Add className='max-w-[160px] truncate' to ObjectLink labels that may overflow.

Constraints:
- Do NOT change data fetching, filtering, sorting, or pagination
- Do NOT remove any existing action buttons — add ObjectTrigger alongside or replace dots menu
- slug comes from useParams() — use existing extraction

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — services list (codex-dad, rownolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectCell, ObjectTrigger.

Goal: Integrate ObjectCell and ObjectTrigger into services list.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/page.tsx

Changes:
1. Import ObjectCell, ObjectTrigger from '@/components/objects'.
2. Find where services are rendered (table rows OR grid cards — determine from current code).
3. For each service item:
   a. Replace service name text/link with: <ObjectCell type='service' id={svc.id} label={svc.name} slug={slug} meta={svc.duration_min ? svc.duration_min + ' min' : undefined} showActions={false} />
   b. Add ObjectTrigger: <ObjectTrigger type='service' id={svc.id} label={svc.name} slug={slug} />
4. If a DropdownMenu already exists per service row, replace its Trigger with ObjectTrigger, keeping the existing DropdownMenuContent items.
5. Add e.stopPropagation() on ObjectCell onClick and ObjectTrigger onClick.
6. Do NOT change category grouping, add-service dialog, price editing, or any other functionality.

Constraints:
- Do NOT remove the service creation flow
- Do NOT remove addon/template sections
- Do NOT touch the service form or drawer
- slug comes from existing params extraction

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-44-bookings | Type: implementation | Worker: codex-dad | Inputs: bookings/page.tsx, objects/index.ts | Outputs: interactive booking rows
- ID: pkg-44-services | Type: implementation | Worker: codex-dad | Inputs: services/page.tsx, objects/index.ts | Outputs: interactive service rows/cards

## Verification

```bash
npx tsc --noEmit
# Test manualny: bookings list → klik w nazwe klienta → /clients/[id]
# Test manualny: bookings list → klik w tlo wiersza → /bookings/[id]
# Test manualny: bookings list → klik w ObjectTrigger → RelatedActionsMenu
# Test manualny: services list → klik w nazwe uslugi → /services (lub ObjectPreview)
# Test manualny: services list → ObjectTrigger → menu z edytuj/wlacz-wylacz
```

## Acceptance criteria

- [ ] Bookings list: wiersz ma ObjectCell (klient), ObjectLink (pracownik), ObjectPill (usluga), ObjectTrigger (booking)
- [ ] Bookings list: 3-click-zone separation — brak konfliktu klikniecia
- [ ] Services list: kazda usluga ma ObjectCell z klikalna nazwa
- [ ] Services list: ObjectTrigger z RelatedActionsMenu per usluga
- [ ] Dlugie nazwy: truncate, brak overflow layoutu
- [ ] `npx tsc --noEmit` → clean
