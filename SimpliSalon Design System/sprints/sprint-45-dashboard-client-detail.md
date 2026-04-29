# Sprint SS2.4-45 - Dashboard widgets + Client detail

## Cel

Dashboard to pierwsze co widzi uzytkownik — widgety "dzisiejsze wizyty" musza pokazywac
klientow i pracownikow jako klikalne obiekty. Client detail to hub informacyjny klienta
z historia wizyt — kazda wizyta powinna miec klikalne linki do pracownika i uslugi.

Oba pliki ida rownolegle (brak wspolnych importow).

Zaleznosc: Sprint 41 zamkniety.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract section 09.1 (ObjectLink inline) and 09.2 (ObjectPill compact): visual spec, max-width rules, overflow behavior, dot/icon alignment. FORMAT: Bulleted list." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` | sekcja 09.1 i 09.2 — inline i compact objects |

## Zdiagnozowane problemy

- [ ] `dashboard/page.tsx` — widgety z wizytami renderuja plain text bez interaktywnosci
- [ ] `clients/[id]/page.tsx` — historia wizyt nie ma kliknalnych linkow do pracownikow/uslug

## Zakres

### A — Dashboard widgets (codex-dad)

Plik: `app/(dashboard)/[slug]/dashboard/page.tsx` (365 linii)

- [ ] Zidentyfikuj sekcje gdzie renderowane sa dzisiejsze wizyty / upcoming bookings
- [ ] W kazdej karcie wizyty:
  - Nazwa klienta → `<ObjectLink type="client" id={b.client_id} label={b.client_name} slug={slug} />`
  - Nazwa pracownika → `<ObjectLink type="worker" id={b.employee_id} label={b.employee_name} slug={slug} showDot />`
  - Nazwa uslugi → `<ObjectPill type="service" id={b.service_id} label={b.service_name} slug={slug} />`
- [ ] Jesli widgety sa server components — upewnij sie ze ObjectLink jest client-safe
      (ObjectLink to komponent klienki — nie wymaga danych z serwera)
- [ ] Nie zmieniac widgetow KPI (przychod, liczba wizyt) — tylko rendering wizyt
- [ ] Nie zmieniac layoutu strony

### B — Client detail (codex-dad, rownolegle z A)

Plik: `app/(dashboard)/[slug]/clients/[id]/page.tsx` (663 linii)

- [ ] Zidentyfikuj sekcje z historia wizyt / appointment history
- [ ] W kazdym wierszu historii wizyt:
  - Nazwa pracownika → `<ObjectLink type="worker" id={b.employee_id} label={b.employee_name} slug={slug} showDot />`
  - Nazwa uslugi → `<ObjectPill type="service" id={b.service_id} label={b.service_name} slug={slug} />`
  - Akcje rezerwacji → `<ObjectTrigger type="booking" id={b.id} label={b.service_name ?? 'Wizyta'} slug={slug} meta={b.booking_date} />`
- [ ] Zidentyfikuj sekcje z powiazanymi uslugami klienta (ulubione uslugi itp.) jesli jest
- [ ] Klik w tlo wiersza historii → router.push do /bookings/[id] lub otwarcie detalu
- [ ] e.stopPropagation() na ObjectLink, ObjectPill, ObjectTrigger wewnatrz wiersza
- [ ] Nie zmieniac sekcji danych klienta (nazwa, kontakt, tagi, notatki, bilans)

## Dispatch commands

### Pkg A — dashboard (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/dashboard/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectLink, ObjectPill.

Goal: Add clickable ObjectLink and ObjectPill to booking widgets on the dashboard.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/dashboard/page.tsx

Changes:
1. Import ObjectLink, ObjectPill from '@/components/objects'. Use 'use client' directive if needed.
2. Find sections rendering today's or upcoming bookings (look for booking/appointment rendering).
3. In each booking card or row inside a widget:
   a. Replace client name text with: <ObjectLink type='client' id={b.client_id} label={b.client_name ?? 'Klient'} slug={slug} />
   b. Replace employee name text with: <ObjectLink type='worker' id={b.employee_id} label={b.employee_name ?? 'Pracownik'} slug={slug} showDot />
   c. Replace service name text with: <ObjectPill type='service' id={b.service_id} label={b.service_name ?? 'Usluga'} slug={slug} />
4. If this is a server component, extract the booking widget part into a small client component.
5. Do NOT change KPI widgets, revenue chart, or any non-booking sections.

Constraints:
- Do NOT change data fetching or Supabase queries
- Do NOT change the dashboard layout
- slug available from params

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — client detail (codex-dad, rownolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see ObjectLink, ObjectPill, ObjectTrigger.

Goal: Add clickable ObjectLink, ObjectPill, ObjectTrigger to appointment history in client detail.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx

Changes:
1. Import ObjectLink, ObjectPill, ObjectTrigger from '@/components/objects'.
2. Find the appointment history section (look for booking list, visit history, or similar).
3. In each history row or card:
   a. Employee name → <ObjectLink type='worker' id={b.employee_id} label={b.employee_name ?? 'Pracownik'} slug={slug} showDot />
   b. Service name → <ObjectPill type='service' id={b.service_id} label={b.service_name ?? 'Usluga'} slug={slug} />
   c. Add action trigger → <ObjectTrigger type='booking' id={b.id} label={b.service_name ?? 'Wizyta'} slug={slug} meta={b.booking_date} />
4. Add e.stopPropagation() on each ObjectLink, ObjectPill, ObjectTrigger click.
5. Wrap history row in onClick handler to navigate to booking detail (with stopPropagation on object clicks).
6. Do NOT change client info section, tags, notes, balance, or any other section.
7. Do NOT change data fetching.

Constraints:
- Preserve existing client profile layout
- slug and client id from params

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-45-dashboard | Type: implementation | Worker: codex-dad | Inputs: dashboard/page.tsx | Outputs: klikalne obiekty w widgetach
- ID: pkg-45-client-detail | Type: implementation | Worker: codex-dad | Inputs: clients/[id]/page.tsx | Outputs: klikalne obiekty w historii wizyt

## Verification

```bash
npx tsc --noEmit
# Test manualny: dashboard → klik w nazwe klienta w widgecie → /clients/[id]
# Test manualny: dashboard → klik w nazwe pracownika → /employees/[id]
# Test manualny: client detail → historia wizyt → klik w pracownika → /employees/[id]
# Test manualny: client detail → historia wizyt → ObjectTrigger → menu booking
```

## Acceptance criteria

- [ ] Dashboard: wizyty w widgetach maja klikalne ObjectLink dla klienta i pracownika
- [ ] Dashboard: uslugi w widgetach jako ObjectPill
- [ ] Client detail: historia wizyt ma ObjectLink (pracownik), ObjectPill (usluga), ObjectTrigger (booking)
- [ ] Brak konfliktu klikniec (row click vs object click)
- [ ] `npx tsc --noEmit` → clean
