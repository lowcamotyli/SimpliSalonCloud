# Sprint B — Booking Card: Trzy strefy kliknięcia

## Owner
- Orchestrator: Claude | Workers: codex-dad (B1) | Status: plan
- **Bloker:** Sprint A musi być zakończony i tsc clean przed dispatcnhem

## Intent
Zaktualizować `components/calendar/booking-card.tsx` (250 linii) aby obiekty wewnątrz (klient, pracownik, usługa) były interaktywne. Podzielić kartę na 3 strefy klikalne bez konfliktu zdarzeń. Używa prymitywów z Sprint A.

## Architektura — dokumenty referencyjne

```bash
DAD_PROMPT='Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html" section 09.3 (object row inside booking card). List ALL constraints: click zones, stopPropagation rules, overflow handling, destructive/conflict state visibility. FORMAT: Bulleted list. Do NOT summarize away exceptions.' bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `interactive-objects.html` sekcja 09.3 | Object row inside booking card — dokładna specyfikacja |
| `interactive-objects.html` sekcja 09.0 | Click zone rules — które zdarzenia propagują |
| `components/objects/` | Nowe prymitywy z Sprint A |

## Pliki

| Plik | Worker | Rozmiar | Uwagi |
|------|--------|---------|-------|
| `components/calendar/booking-card.tsx` | **dad B1** | 250 linii | Edycja istniejącego |

## Graf zależności

```
Sprint A (components/objects/) → booking-card.tsx edit (B1)
```

## Constraints

- **3 strefy klikalne — WYMAGANE:**
  1. Klik tło/czas/status/cena/główne body → `onBookingClick(id)` (istniejący handler)
  2. Klik nazwa/avatar klienta, pracownika, usługi → `ObjectLink`/`ObjectPill` naviguje do profilu
  3. Klik `...` trigger → `ObjectTrigger` otwiera Related Actions, `stopPropagation` obowiązkowy
- Strefa 2 i 3 MUSZĄ wywołać `e.stopPropagation()` — brak propagacji do strefy 1
- Długa nazwa nie może rozpychać wiersza — `truncate` + `max-w-*`
- Status i cena muszą pozostać czytelne (nie chować za overflow)
- Destructive/conflict state (np. anulowana rezerwacja) — widoczny ale nie niszczy kontrastu
- Nie zmieniać istniejących propsów komponentu — tylko dodać nowe opcjonalne

## Dispatch — codex-dad B1

```bash
DAD_PROMPT='Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx (current implementation).
Read /mnt/d/SimpliSalonCLoud/components/objects/index.ts and /mnt/d/SimpliSalonCLoud/components/objects/object-config.ts (Sprint A output).
Read "/mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html" section 09.3 for booking card object row spec.

Goal: Refactor components/calendar/booking-card.tsx to implement 3 click zones for interactive objects.

THREE CLICK ZONES (implement all three):
1. BACKGROUND ZONE — entire card/row click handler (existing onBookingClick or similar):
   - Covers: empty background, time slot, status badge, price, main body
   - Action: opens booking details (keep existing handler)

2. OBJECT ZONE — client name/avatar, worker name/avatar, service name:
   - Replace plain text/avatar with ObjectPill (avatar + name) or ObjectLink (name only)
   - Import from @/components/objects
   - Types: client → type="client", worker → type="worker", service → type="service"
   - Pass slug from nearest slug context (use useParams() or receive as prop)
   - Add e.stopPropagation() to prevent zone 1 activation
   - Truncate long labels: max-w-[120px] truncate on ObjectLink

3. TRIGGER ZONE — "..." button per object:
   - Add ObjectTrigger next to each ObjectPill/ObjectLink
   - ObjectTrigger must also stopPropagation
   - On desktop: opens RelatedActionsMenu dropdown
   - On mobile: opens RelatedActionsSheet bottom sheet
   - Actions from getActions(type) with id and slug context

LAYOUT RULES:
- Each object row: [ObjectPill | max-w constrained] [ObjectTrigger | flex-shrink-0] — flex row items-center gap-1
- Status badge and price: flex-shrink-0 so they never overflow
- Destructive state (cancelled/conflict): use text-destructive or ring-destructive on card border — do NOT change text contrast of object links
- Missing object (no client assigned): ObjectPill with missing state (italic, opacity-50, no link)

SLUG: If booking-card does not currently receive slug prop, add optional `slug?: string` prop. If slug is unavailable, disable ObjectLink navigation (href="#", aria-disabled).

File to edit: /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx
Constraints: Do not change existing prop interface signatures. Add new optional props only. Keep all existing functionality.
Done when: file written with 3 click zones, no TypeScript errors in the file itself.' bash ~/.claude/scripts/dad-exec.sh
```

## Weryfikacja po Sprint B

```bash
# 1. TypeScript check
cd d:/SimpliSalonCLoud && npx tsc --noEmit 2>&1 | head -50

# 2. Wiring check — czy ObjectLink/ObjectPill są faktycznie importowane
grep -r "ObjectPill\|ObjectLink\|ObjectTrigger" d:/SimpliSalonCLoud/components/calendar/booking-card.tsx

# 3. Jeśli błędy → dad fixer
DAD_PROMPT='Read .workflow/skills/typescript-repair.md and follow it.
Run npx tsc --noEmit in /mnt/d/SimpliSalonCLoud. Fix all TypeScript errors in components/calendar/booking-card.tsx. Do not change logic, only fix types and imports.' bash ~/.claude/scripts/dad-exec.sh
```

## Acceptance criteria

- [ ] booking-card.tsx importuje ObjectPill/ObjectLink/ObjectTrigger z `@/components/objects`
- [ ] Klik w nazwę/avatar klienta nawiguje do profilu klienta (nie otwiera booking details)
- [ ] Klik w `...` trigger otwiera RelatedActionsMenu/Sheet, nie propaguje do card
- [ ] Klik w tle/time/status/cena nadal otwiera booking details
- [ ] Długie nazwy są truncated, nie psują layoutu
- [ ] `npx tsc --noEmit` przechodzi czysto

## Decision
Ship: TBD
