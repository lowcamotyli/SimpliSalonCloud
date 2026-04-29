# Sprint SS2.4-55 - Revamp v3 core domain screens

## Cel

Dopasowac glowne listy i detale domenowe do Revamp v3: clients, services, employees, equipment,
vouchers, payroll. Ten sprint skupia sie na tabelach, kartach, naglowkach, filtrach i object cells.

Zaleznosc: Sprinty 50-54 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract specs for tables, object cells, page heading/action rows, badges, empty states, filters, dense operational forms/lists. FORMAT: grouped by page pattern." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | table/card/page patterns |
| `SimpliSalon Design System/revamp/interactive-objects.html` | object table/cell/menu patterns |
| `app/(dashboard)/[slug]/clients/page.tsx` | clients list |
| `app/(dashboard)/[slug]/clients/[id]/page.tsx` | client detail |
| `app/(dashboard)/[slug]/services/page.tsx` | services list |
| `app/(dashboard)/[slug]/employees/page.tsx` | employees list |
| `app/(dashboard)/[slug]/employees/[id]/page.tsx` | employee detail |
| `app/(dashboard)/[slug]/equipment/page.tsx` | equipment list |
| `app/(dashboard)/[slug]/vouchers/page.tsx` | vouchers list |
| `app/(dashboard)/[slug]/payroll/page.tsx` | payroll page |

## Zdiagnozowane problemy

- [ ] Wiele stron ma rozne lokalne klasy i nie dziedziczy primitives
- [ ] Niektore tabele/listy nadal renderuja obiekty jako plain text
- [ ] Naglowki stron i action rows nie maja jednego v3 rytmu
- [ ] Stany empty/loading/error sa niespojne

## Zakres

### A - Clients screens (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/clients/page.tsx`
- `components/clients/clients-list-view.tsx`
- `app/(dashboard)/[slug]/clients/[id]/page.tsx`
- `components/clients/*` visual wrappers

- [ ] Clients list: v3 table/object cells/actions
- [ ] Client detail: cards flat, headings v3, balance/treatment/form sections aligned
- [ ] CRM tags/badges use v3 badge variants
- [ ] No data or permission changes

### B - Services + employees screens (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/services/page.tsx`
- `components/services/*`
- `app/(dashboard)/[slug]/employees/page.tsx`
- `app/(dashboard)/[slug]/employees/[id]/page.tsx`
- `components/employees/*` visual wrappers

- [ ] Service names/prices use display font/gold where appropriate
- [ ] Employees as worker ObjectCell/ObjectPill
- [ ] Forms/tabs/cards use primitives from Sprint 51
- [ ] Schedule/shifts visual stays functional

### C - Operational finance/equipment screens (codex-dad)

Pliki:
- `app/(dashboard)/[slug]/equipment/page.tsx`
- `components/equipment/equipment-list-view.tsx`
- `app/(dashboard)/[slug]/vouchers/page.tsx`
- `app/(dashboard)/[slug]/payroll/page.tsx`
- `app/(dashboard)/[slug]/payments/page.tsx`

- [ ] Tables/cards/filters visual parity
- [ ] Badges/status colors v3
- [ ] Prices/revenue use display font and tabular nums
- [ ] No payment/payroll logic changes

## Dispatch commands

### Pkg A - clients

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/page.tsx, /mnt/d/SimpliSalonCLoud/components/clients/clients-list-view.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/clients/[id]/page.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html table/card/page heading styles and /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html ObjectCell styles.

Goal: Align clients list and client detail screens with Revamp v3.

Constraints:
- Do NOT change client fetching, mutations, permissions or routing.
- Use existing UI primitives and components/objects.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B - services + employees

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/services/page.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/page.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/employees/[id]/page.tsx.
Read relevant files under /mnt/d/SimpliSalonCLoud/components/services and /mnt/d/SimpliSalonCLoud/components/employees only when imported by those pages.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html table/card/form styles.

Goal: Align services and employees screens with Revamp v3.

Constraints:
- Do NOT alter service assignment logic, employee schedules, shifts, or API calls.
- Visual styling only unless existing components need className passthrough.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C - operational finance/equipment

```bash
DAD_PROMPT="Read .workflow/skills/scoped-implementation.md and follow it.
Read /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/equipment/page.tsx, /mnt/d/SimpliSalonCLoud/components/equipment/equipment-list-view.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/vouchers/page.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payroll/page.tsx, /mnt/d/SimpliSalonCLoud/app/(dashboard)/[slug]/payments/page.tsx.
Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html table/card/badge/price styles.

Goal: Align equipment, vouchers, payroll and payments screens with Revamp v3.

Constraints:
- Do NOT change payment, payroll, voucher or equipment business logic.
- Preserve form validation and submit handlers.

Done when: npm run typecheck passes." bash ~/.claude/scripts/dad-exec.sh
```

## Work packages

- ID: pkg-55-clients | Type: implementation | Worker: codex-dad | Inputs: clients pages/components | Outputs: v3 clients screens
- ID: pkg-55-services-employees | Type: implementation | Worker: codex-dad | Inputs: services/employees pages/components | Outputs: v3 operational screens
- ID: pkg-55-finance-equipment | Type: implementation | Worker: codex-dad | Inputs: equipment/vouchers/payroll/payments | Outputs: v3 finance/equipment screens

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual:
# clients list/detail, services list, employee detail, equipment, vouchers, payroll, payments
```

## Acceptance criteria

- [ ] Core domain tables use v3 table/card primitives
- [ ] Business object names use ObjectCell/ObjectLink/ObjectPill where data exists
- [ ] Headings/actions/filters follow one v3 rhythm
- [ ] Status and money displays use v3 badges/display font
- [ ] No logic regressions in sensitive finance/payroll/payment flows
- [ ] `npm run typecheck` -> clean
