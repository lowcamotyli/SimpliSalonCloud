# Sprint SS2.4-43 - Booking card hardening + Employees integration

## Cel

Na podstawie audytu ze Sprintu 42: dokonczyc integracje employees i zhardenic booking-card.
Booking card to centralny element kalendarza — 3-click-zone musi dzialac bez zadnych konflikow.
Employees list to pierwszy wielki widok tabelaryczny z interaktywnymi obiektami.

Zaleznosc: Sprint 41 musi byc zamkniety (getActions z ctx gotowe).

## Architektura - dokumenty referencyjne

Sekcja 09.3 z interactive-objects.html definiuje dokladny wzorzec booking row.

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract ONLY section 09.3 (Object row inside booking card): list all click zones, stopPropagation requirements, visual constraints (overflow, long label, destructive state). FORMAT: Bulleted list. Do NOT summarize away any constraint." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` | sekcja 09.3 — booking row spec |
| `SimpliSalon Design System/revamp/tokens-v3.css` | tokeny, kolory obiektow |

## Zdiagnozowane problemy (uzupelnione po audycie Sprint 42)

- [ ] [Uzupelnic po uruchomieniu Sprint 42 — wpisac FAILe z raportu]
- [ ] Employees list: [YES/NO z raportu — uzupelnic]

## Zakres

### A — Booking card hardening (codex-dad)

Plik: `components/calendar/booking-card.tsx` (367 linii)

- [ ] Dodaj `e.stopPropagation()` na kazdym `<ObjectLink>` i `<ObjectTrigger>` wewnatrz karty
      — wrapper onClick lub prop onClick jesli komponent go przyjmuje
- [ ] Card body click (pusty obszar, czas, status, cena) → `router.push(/${slug}/bookings/${booking.id})`
- [ ] Długie nazwy: `max-w-[140px] truncate` na etykietach klienta, pracownika i uslugi
- [ ] Cancelled booking: klasa `opacity-60` na card body, status badge `destructive` variant
- [ ] Dodaj `aria-haspopup="menu"` i `aria-expanded={open}` do ObjectTrigger props
- [ ] Poprawione getActions wywolanie: `getActions('client', client.id, ctx)` gdzie ctx zawiera
      router, slug, toast — przekazuj ctx z hooka useRouter/useParams/toast
- [ ] Nie usuwaj zadnych istniejacych props ani handlerow

### B — Employees list integration (codex-dad)

Plik: `app/(dashboard)/[slug]/employees/page.tsx` (985 linii)

Jesli po audycie okazuje sie ze employees NIE uzywaja objects:
- [ ] Zaimportuj `ObjectCell` z `@/components/objects`
- [ ] Kazdy wiersz tabeli z pracownikiem: zamien rendering nazwy na `<ObjectCell type="worker" id={emp.id} label={emp.full_name} slug={slug} meta={emp.role} />`
- [ ] Dodaj `<ObjectTrigger type="worker" id={emp.id} label={emp.full_name} slug={slug} />` jako akcje wiersza
      (lub juz istniejacy przycisk akcji zamien na ObjectTrigger)
- [ ] `showActions={true}` w ObjectCell lub osobna kolumna "Akcje" z ObjectTrigger
- [ ] Nie usuwaj istniejacych filtrów, sortowan, paginacji — zmieniaj tylko rendering wiersza

Jesli po audycie okazuje sie ze employees JUZ uzywaja objects — wpisz tu konkretne luki z raportu.

### C — Employees detail light integration (codex-main)

Plik: `app/(dashboard)/[slug]/employees/[id]/page.tsx` (113 linii)

- [ ] Zaimportuj `ObjectLink`, `ObjectPill` z `@/components/objects`
- [ ] Powiazane uslugi pracownika: `<ObjectLink type="service" id={svc.id} label={svc.name} slug={slug} />`
- [ ] Powiazane rezerwacje (jesli renderowane): `<ObjectLink type="booking" id={b.id} label={b.client_name} slug={slug} />`
- [ ] Nie zmieniac layoutu strony — tylko wewnetrzne linki do obiektow

## Dispatch commands

### Pkg A — booking-card (codex-dad)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts first 30 lines to understand getActions signature after Sprint 41.

Goal: Harden booking card 3-click-zone separation and wire getActions ctx.

File: /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx

Changes:
1. Import useRouter, useParams from next/navigation. Import toast from sonner.
   Build ctx = { router, slug: params.slug, toast: (msg) => toast(msg) } inside component.
2. Pass ctx to every getActions call: getActions('client', clientId, ctx), getActions('worker', workerId, ctx), getActions('booking', booking.id, ctx).
3. Add e.stopPropagation() inside onClick for every ObjectLink and ObjectTrigger.
4. Wrap card body in a div with onClick={() => router.push(/${params.slug}/bookings/${booking.id})}.
   This div must NOT wrap ObjectLink or ObjectTrigger elements.
5. Add max-w-[140px] truncate to name labels that could overflow.
6. Add opacity-60 class to card body when booking.status === 'cancelled'.
7. Pass aria-haspopup='menu' to ObjectTrigger if it accepts extra props; otherwise leave.

Constraints:
- Do NOT change the visual layout of the card
- Do NOT remove existing delete button or any existing handler
- Do NOT change TypeScript types of Booking
- The 3 zones must be mutually exclusive: body click does not fire when clicking object or trigger

Done when: npx tsc --noEmit passes and no TypeScript errors in this file." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B — employees page (codex-dad, równolegle z A)

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/page.tsx for full context.
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts to see what ObjectCell, ObjectTrigger export.

Goal: Integrate ObjectCell and ObjectTrigger into employee list rows.

File: /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/page.tsx

Changes:
1. Import ObjectCell, ObjectTrigger from '@/components/objects'.
2. In each employee table row, replace the employee name rendering with:
   <ObjectCell type='worker' id={emp.id} label={emp.name or emp.full_name} slug={slug} meta={emp.role} showActions={false} />
3. In the actions column (or after the name cell), add:
   <ObjectTrigger type='worker' id={emp.id} label={emp.name or emp.full_name} slug={slug} meta={emp.role} />
4. Do NOT remove existing edit/delete buttons — place ObjectTrigger alongside them or replace the dots menu if one already exists.
5. Do NOT change filters, pagination, sorting, or any data fetching.
6. If employees are shown in a grid instead of table, apply ObjectCell in the card layout.

Constraints:
- Preserve all RBAC guards (permission-guard wrappers)
- Do NOT change the page data fetching (server component parts)
- slug comes from params — use existing params extraction

Done when: npx tsc --noEmit passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C — employees detail (codex-main, równolegle z A i B)

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read app/(dashboard)/[slug]/employees/[id]/page.tsx for context.
Read components/objects/index.ts to see ObjectLink, ObjectPill exports.

Goal: Add ObjectLink and ObjectPill to related services and bookings in employee detail.

File: app/(dashboard)/[slug]/employees/[id]/page.tsx

Changes:
1. Import ObjectLink, ObjectPill from '@/components/objects'.
2. Where services are listed: replace plain service name with <ObjectLink type='service' id={svc.id} label={svc.name} slug={slug} />.
3. Where bookings are listed (if any): replace client name or booking reference with <ObjectLink type='booking' id={b.id} label={b.client_name ?? 'Wizyta'} slug={slug} />.
4. Do NOT change layout, heading, or data fetching.

Done when: npx tsc --noEmit passes." < /dev/null
```

## Work packages

- ID: pkg-43-booking-card | Type: implementation | Worker: codex-dad | Outputs: 3-click-zone separation, getActions ctx
- ID: pkg-43-employees-page | Type: implementation | Worker: codex-dad | Outputs: ObjectCell + ObjectTrigger w liscie pracownikow
- ID: pkg-43-employees-detail | Type: implementation | Worker: codex-main | Outputs: ObjectLink w employee detail

## Verification

```bash
npx tsc --noEmit
# Test manualny: klik w booking card body → /bookings/[id]
# Test manualny: klik w ObjectLink klienta → /clients/[id], nie otwiera booking detail
# Test manualny: klik w ObjectTrigger → menu, nie otwiera booking detail
# Test manualny: employees list → kazdy pracownik ma klikalna nazwe i menu akcji
```

## Acceptance criteria

- [ ] Booking card: klik w tlo/czas/status/cene → `/bookings/[id]`
- [ ] Booking card: klik w ObjectLink klienta/pracownika/uslugi → profil objektu, nie booking detail
- [ ] Booking card: klik w ObjectTrigger → RelatedActionsMenu, nie booking detail
- [ ] Employees list: ObjectCell z klikalna nazwa dla kazdego pracownika
- [ ] Employees list: ObjectTrigger z RelatedActionsMenu per pracownik
- [ ] Employees detail: uslugi i rezerwacje jako klikalne ObjectLink
- [ ] `npx tsc --noEmit` → clean
