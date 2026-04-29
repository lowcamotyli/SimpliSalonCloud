# Sprint SS2.4-51 - Revamp v3 UI primitives

## Cel

Przepisac bazowe komponenty UI tak, zeby cala aplikacja dziedziczyla styl z `revamp.html`.
Sprint obejmuje tylko primitives: button, card, badge, input/select/textarea, table, tabs, dialog,
dropdown, tooltip, skeleton/loading. Bez przebudowy ekranow domenowych.

Zaleznosc: Sprint 50 zamkniety.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/revamp.html. Extract component specs for: buttons, fields, search, checkbox, radio, toggle, card, stat, badge, table, modal, toast, tooltip, tabs. Include sizes, colors, border radius, hover, active, disabled, focus-visible, typography. FORMAT: one heading per component with exact values." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/revamp.html` | komponenty bazowe i stany |
| `SimpliSalon Design System/revamp/tokens-v3.css` | tokeny do uzycia w klasach |
| `components/ui/button.tsx` | button variants |
| `components/ui/card.tsx` | card shell |
| `components/ui/badge.tsx` | status/premium badges |
| `components/ui/input.tsx`, `textarea.tsx`, `select.tsx` | pola formularzy |
| `components/ui/table.tsx` | tabele |
| `components/ui/tabs.tsx` | tabs |
| `components/ui/dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx` | overlays |

## Zdiagnozowane problemy

- [ ] Button default nadal uzywa starych Tailwind tokenow bez v3 sizingu
- [ ] Card ma ogolny `rounded-lg shadow-sm`, ale nie ma v3 header/body language
- [ ] Badge nie ma wariantu `info`, `neutral`, `gold`
- [ ] Inputs/tables/tabs nie maja dokladnych hover/focus/spacing ze wzorca
- [ ] Dialog/dropdown/tooltip potrzebuja neutralnych cieni i focus ring v3

## Zakres

### A - Button + Badge (codex-main)

Pliki:
- `components/ui/button.tsx`
- `components/ui/badge.tsx`

- [ ] Button variants: default/primary, secondary, ghost, destructive, link, gold
- [ ] Sizes: sm 32px, default 40px, lg 48px, icon 36/40px wg istniejacego API
- [ ] Focus visible: `var(--v3-shadow-focus)`
- [ ] Disabled: `#C5CACE`, bez shadow
- [ ] Badge variants: success, info, warning, error/destructive, neutral, gold

### B - Card + Table + Tabs (codex-main)

Pliki:
- `components/ui/card.tsx`
- `components/ui/table.tsx`
- `components/ui/tabs.tsx`

- [ ] Card: white, `1px solid var(--v3-border)`, `var(--v3-r-md)`, subtle shadow
- [ ] CardHeader: 16x20px, bottom border, compact h3 style
- [ ] Table: header bg `--v3-bg-alt`, 12/16px cells, even row alt, hover `--v3-secondary-soft`
- [ ] Tabs: bottom border, active blue underline, compact UI font

### C - Form controls + overlays (codex-main)

Pliki:
- `components/ui/input.tsx`
- `components/ui/textarea.tsx`
- `components/ui/select.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/switch.tsx`
- `components/ui/dialog.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/skeleton.tsx`

- [ ] Input/select/textarea: 40px, border v3, hover border strong, focus v3 shadow
- [ ] Checkbox/radio/switch: primary green selected, accessible focus
- [ ] Dialog: radius 8/12, modal shadow, no glass/backdrop blur cards
- [ ] Dropdown: white surface, neutral border, row hover `--v3-bg-alt`
- [ ] Tooltip: dark text-on-dark, `--v3-shadow-tooltip`
- [ ] Skeleton: neutral shimmer from interactive object spec

## Dispatch commands

### Pkg A - Button + Badge

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/ui/button.tsx and components/ui/badge.tsx.
Read SimpliSalon Design System/revamp/revamp.html component styles for .btn and .badge.

Goal: Update Button and Badge primitives to Revamp v3.

Files:
- components/ui/button.tsx
- components/ui/badge.tsx

Changes:
1. Update cva classes to match Revamp v3 sizes, colors, radius, hover, disabled, focus-visible.
2. Add gold and info/neutral variants where missing.
3. Preserve public props and existing variant names.
4. Keep data-variant and data-size attributes.

Done when: npm run typecheck passes." < /dev/null
```

### Pkg B - Card + Table + Tabs

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/ui/card.tsx, components/ui/table.tsx, components/ui/tabs.tsx.
Read SimpliSalon Design System/revamp/revamp.html styles for .card, .table, .tabs.

Goal: Update Card, Table and Tabs primitives to Revamp v3.

Files:
- components/ui/card.tsx
- components/ui/table.tsx
- components/ui/tabs.tsx

Constraints:
- Preserve exported component names.
- Do NOT change table semantics.
- Do NOT change Radix tabs behavior.

Done when: npm run typecheck passes." < /dev/null
```

### Pkg C - Form controls + overlays

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/ui/input.tsx, textarea.tsx, select.tsx, checkbox.tsx, switch.tsx, dialog.tsx, dropdown-menu.tsx, tooltip.tsx, skeleton.tsx.
Read SimpliSalon Design System/revamp/revamp.html styles for fields, modal, dropdown, tooltip and loading states.

Goal: Align form controls and overlays with Revamp v3.

Changes:
1. Update visual classes only.
2. Preserve all controlled/uncontrolled behavior.
3. Use --v3-* CSS variables.
4. Ensure focus-visible styles are present.

Done when: npm run typecheck passes and pwsh ./scripts/check-encoding.ps1 passes." < /dev/null
```

## Work packages

- ID: pkg-51-button-badge | Type: implementation | Worker: codex-main | Inputs: button.tsx, badge.tsx | Outputs: v3 variants
- ID: pkg-51-card-table-tabs | Type: implementation | Worker: codex-main | Inputs: card.tsx, table.tsx, tabs.tsx | Outputs: v3 layout primitives
- ID: pkg-51-forms-overlays | Type: implementation | Worker: codex-main | Inputs: ui form/overlay files | Outputs: v3 controls

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual: open dashboard, settings form, table view, dialog, dropdown and verify focus/hover states.
```

## Acceptance criteria

- [ ] Button variants match `revamp.html`
- [ ] Badges include success/info/warning/error/neutral/gold
- [ ] Cards/tables/tabs match v3 surfaces, borders, radius, hover
- [ ] Form controls use v3 focus/hover/disabled states
- [ ] Dialog/dropdown/tooltip use v3 shadows and borders
- [ ] `npm run typecheck` -> clean
