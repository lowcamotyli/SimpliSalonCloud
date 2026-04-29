# Sprint SS2.4-54 - Revamp v3 dashboard, calendar + bookings

## Cel

Przeniesc najwazniejsze ekranowe wzorce z `revamp.html`: dashboard stat cards, dzisiejsze wizyty,
kalendarz/rezerwacje i booking cards. To sprint widoczny dla uzytkownika po zalogowaniu.

Zaleznosc: Sprinty 50-53 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract specs for dashboard stats, quick actions, booking list/card, calendar booking row, booking status badges, prices, time column, active/hover booking states. FORMAT: component-by-component bullet list with exact visual values." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | dashboard cards, booking cards, stats |
| `SimpliSalon Design System/revamp/interactive-objects.html` | object rows inside booking card |
| `app/(dashboard)/[slug]/dashboard/page.tsx` | dashboard screen |
| `components/dashboard/stat-card.tsx` | stat visual |
| `components/calendar/booking-card.tsx` | shared booking card |
| `app/(dashboard)/[slug]/calendar/booking-card.tsx` | calendar-specific booking card |
| `app/(dashboard)/[slug]/calendar/page.tsx` | calendar screen |
| `app/(dashboard)/[slug]/bookings/page.tsx` | bookings list |

## Zdiagnozowane problemy

- [ ] Dashboard cards nadal moga miec stary gradient/glass wyglad
- [ ] Booking cards potrzebuja display font dla uslugi i gold dla ceny
- [ ] Kalendarz musi zachowac gesty/klikniecia po zmianie stylu
- [ ] Status badges powinny uzyc v3 variants
- [ ] Object rows w booking card musza byc gestsze i zgodne z interactive objects

## Zakres

### A - Dashboard stats + quick actions (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/dashboard/page.tsx`
- `components/dashboard/stat-card.tsx`
- `components/dashboard/*chart*.tsx` tylko visual wrapper jesli potrzebne

- [ ] Stat card jak `.stat`: white, border, radius 8, subtle shadow
- [ ] Icon top-right 32px, soft secondary/gold bg
- [ ] Value display font 32px, tabular nums
- [ ] Trend UI font 12px success/error
- [ ] Quick actions jako v3 buttons, no full-width marketing cards

### B - Booking cards visual parity (codex-dad)

Pliki:
- `components/calendar/booking-card.tsx`
- `app/(dashboard)/[slug]/calendar/booking-card.tsx`
- `components/bookings/payment-status-badge.tsx`

- [ ] Time column: UI font 13/15, tabular nums
- [ ] Category bar: 4px, radius 2
- [ ] Service title: display font 17px
- [ ] Meta row: client + worker as ObjectLink/ObjectPill where available
- [ ] Price: display font 17px, gold, tabular nums
- [ ] Hover: border strong + subtle shadow
- [ ] Active/in-progress: secondary-soft background/border

### C - Calendar + bookings screens pass (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/calendar/page.tsx`
- `app/(dashboard)/[slug]/bookings/page.tsx`
- `components/calendar/booking-dialog.tsx` visual only if used from both

- [ ] Page heading: display font hierarchy from v3
- [ ] Toolbar buttons/search/filter controls use primitives from Sprint 51
- [ ] Calendar shell: white card/surface, no gradient/glass
- [ ] Booking list rows/cards align with B
- [ ] No business logic changes in drag/drop, filters, dialog submit

## Dispatch commands

### Pkg A - dashboard

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/dashboard/page.tsx and /mnt/d/SimpliSalonCLoud/components/dashboard/stat-card.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html dashboard demo section.

Goal: Match dashboard stat cards and quick actions to Revamp v3.

Files:
- /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/dashboard/page.tsx
- /mnt/d/SimpliSalonCLoud/components/dashboard/stat-card.tsx

Constraints:
- Do NOT change data fetching or metrics.
- Visual classes only unless component API requires a small prop passthrough.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B - booking cards

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/components/calendar/booking-card.tsx and /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/booking-card.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html booking styles and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html booking-card object row styles.

Goal: Match booking cards to Revamp v3.

Constraints:
- Do NOT change booking click behavior, drag/drop, status updates or dialog opening.
- Preserve existing props and callbacks.
- Use ObjectLink/ObjectPill where already available; do not invent new data fetches.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C - calendar/bookings pages

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/calendar/page.tsx and /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/bookings/page.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html app main, calendar/list and toolbar patterns.

Goal: Update calendar and bookings page visual shells to Revamp v3.

Constraints:
- Do NOT change filtering, fetching, validation, drag/drop or dialog submit logic.
- Keep mobile behavior.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-54-dashboard | Type: implementation | Worker: codex-dad | Inputs: dashboard page, stat-card | Outputs: v3 dashboard stats/actions
- ID: pkg-54-booking-cards | Type: implementation | Worker: codex-dad | Inputs: booking-card files | Outputs: v3 booking cards
- ID: pkg-54-calendar-bookings | Type: implementation | Worker: codex-dad | Inputs: calendar/bookings pages | Outputs: v3 page shells

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual:
# 1. Dashboard loads, stats match v3.
# 2. Calendar booking hover/active/status states match v3.
# 3. Bookings list retains filters and open booking dialog behavior.
```

## Acceptance criteria

- [ ] Dashboard stat cards match `revamp.html`
- [ ] Booking cards match time/title/meta/price/status visual spec
- [ ] Calendar shell is flat v3 surface
- [ ] Bookings page uses v3 toolbar/list/card primitives
- [ ] No regressions in booking interactions
- [ ] `npm run typecheck` -> clean
