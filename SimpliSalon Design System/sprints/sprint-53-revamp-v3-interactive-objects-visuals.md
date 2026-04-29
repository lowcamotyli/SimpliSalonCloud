# Sprint SS2.4-53 - Revamp v3 interactive objects visuals

## Cel

Dopasowac istniejace `components/objects/*` do finalnego wygladu z `interactive-objects.html`.
Sprint 41-49 domknely funkcje i a11y; ten sprint jest stricte visual parity: dot/avatar/pill/link/menu/preview/table cell.

Zaleznosc: Sprinty 50-52 zamkniete.

## Architektura - dokumenty referencyjne

```bash
DAD_PROMPT="Read /mnt/d/SimpliSalonCLoud/SimpliSalon Design System/revamp/interactive-objects.html. Extract visual specs for ObjectLink, ObjectPill, ObjectAvatar, ObjectCell, ObjectPreview, RelatedActionsMenu, RelatedActionsSheet, object table rows, states loading/missing/disabled/destructive/open. Include type colors for client, worker, service, booking, salon. FORMAT: exact class/spec bullet list by component." bash ~/.claude/scripts/dad-exec.sh
```

| Dokument | Dlaczego |
|----------|----------|
| `SimpliSalon Design System/revamp/interactive-objects.html` | canonical object UI spec |
| `components/objects/object-config.ts` | object type color/icon/route mapping |
| `components/objects/ObjectAvatar.tsx` | avatar/dot visual |
| `components/objects/ObjectLink.tsx` | inline link visual |
| `components/objects/ObjectPill.tsx` | pill visual |
| `components/objects/ObjectCell.tsx` | table/list cell visual |
| `components/objects/ObjectPreview.tsx` | preview card visual |
| `components/objects/RelatedActionsMenu.tsx` | desktop actions menu visual |
| `components/objects/RelatedActionsSheet.tsx` | mobile actions sheet visual |

## Zdiagnozowane problemy

- [ ] Object components moga dziedziczyc stare theme styles po globalnej zmianie
- [ ] Type colors musza byc identyczne z `interactive-objects.html`
- [ ] Loading shimmer, missing, destructive i open states musza byc kompletne
- [ ] RelatedActions menu/sheet powinny miec v3 white surface, neutral border, compact rows

## Zakres

### A - Object type config + avatar/link/pill (codex-dad)

Pliki:
- `components/objects/object-config.ts`
- `components/objects/ObjectAvatar.tsx`
- `components/objects/ObjectLink.tsx`
- `components/objects/ObjectPill.tsx`

- [ ] Type colors:
  - client `#276FB7` / `--v3-secondary-soft`
  - worker `#32855F` / `--v3-primary-soft`
  - service `#B88A43` / `--v3-gold-soft`
  - booking `#6E59C7` / `#ECE7F8`
  - salon `#0875E1` / `#E1EEFB`
- [ ] ObjectLink: inline dot, hover color, focus background, missing dashed dot
- [ ] ObjectPill: pill border, avatar, open/loading/missing/destructive states
- [ ] Avatar sizes: sm 22, default 28, lg 40

### B - ObjectCell + Preview (codex-dad)

Pliki:
- `components/objects/ObjectCell.tsx`
- `components/objects/ObjectPreview.tsx`

- [ ] Cell: avatar + name + meta, compact row spacing
- [ ] Preview head: display serif name, meta grid, action footer
- [ ] Prices/premium values use display font and gold
- [ ] Preserve routes/action logic

### C - Related actions menu/sheet visual pass (codex-main)

Pliki:
- `components/objects/RelatedActionsMenu.tsx`
- `components/objects/RelatedActionsSheet.tsx`
- `components/objects/ObjectTrigger.tsx`

- [ ] Menu: min width 248, white surface, border, radius 8, shadow tooltip/modal
- [ ] Items: 34/36px row, icon 16px, shortcut mono 11px
- [ ] Group separators and section labels match spec
- [ ] Trigger: 22/44px depending context, open state object bg/color
- [ ] Mobile sheet keeps same actions and states

## Dispatch commands

### Pkg A - object basics

```bash
DAD_PROMPT="cd /mnt/d/SimpliSalonCLoud
Read .workflow/skills/scoped-implementation.md and follow it.
Read components/objects/object-config.ts, ObjectAvatar.tsx, ObjectLink.tsx, ObjectPill.tsx.
Read SimpliSalon Design System/revamp/interactive-objects.html sections for ObjectLink, ObjectPill and ObjectAvatar.

Goal: Match object avatar/link/pill visuals to interactive-objects.html.

Files:
- components/objects/object-config.ts
- components/objects/ObjectAvatar.tsx
- components/objects/ObjectLink.tsx
- components/objects/ObjectPill.tsx

Constraints:
- Do NOT change routing or action behavior.
- Preserve props.
- Use --v3-* variables where possible and exact hex values where spec defines object colors.

Done when: npm run typecheck passes.
Return evidence: files changed, commands run with exact results, open risks/follow-ups." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg B - ObjectCell + Preview

```bash
DAD_PROMPT="cd /mnt/d/SimpliSalonCLoud
Read .workflow/skills/scoped-implementation.md and follow it.
Read components/objects/ObjectCell.tsx and ObjectPreview.tsx.
Read SimpliSalon Design System/revamp/interactive-objects.html sections for object table/cell and preview card.

Goal: Match ObjectCell and ObjectPreview visuals to Revamp v3.

Files:
- components/objects/ObjectCell.tsx
- components/objects/ObjectPreview.tsx

Constraints:
- Preserve all data props and action callbacks.
- Do NOT add new fetches.

Done when: npm run typecheck passes.
Return evidence: files changed, commands run with exact results, open risks/follow-ups." bash ~/.claude/scripts/dad-exec.sh
```

### Pkg C - related actions visuals

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "Read .workflow/skills/scoped-implementation.md and follow it.
Read components/objects/RelatedActionsMenu.tsx, RelatedActionsSheet.tsx, ObjectTrigger.tsx.
Read SimpliSalon Design System/revamp/interactive-objects.html sections for RelatedActions dropdown, mobile sheet and triggers.

Goal: Match related actions visuals to interactive-objects.html.

Constraints:
- Do NOT regress Sprint 49 keyboard/a11y behavior.
- Preserve roles, aria-expanded, aria-haspopup and focus return.

Done when: npm run typecheck passes." < /dev/null
```

## Work packages

- ID: pkg-53-object-basics | Type: implementation | Worker: codex-dad | Inputs: object-config/avatar/link/pill | Outputs: v3 object basics
- ID: pkg-53-cell-preview | Type: implementation | Worker: codex-dad | Inputs: ObjectCell, ObjectPreview | Outputs: v3 cell/preview
- ID: pkg-53-actions-visual | Type: implementation | Worker: codex-main | Inputs: RelatedActions*, ObjectTrigger | Outputs: v3 menu/sheet visuals

## Verification

```bash
npm run typecheck
pwsh ./scripts/check-encoding.ps1
# Manual: search results, booking card, clients table, services list, mobile actions sheet.
```

## Acceptance criteria

- [ ] All 5 object types use exact v3 colors
- [ ] ObjectLink/ObjectPill/ObjectAvatar match `interactive-objects.html`
- [ ] Missing/loading/disabled/destructive/open states complete
- [ ] RelatedActions menu/sheet visual parity without a11y regression
- [ ] `npm run typecheck` -> clean
